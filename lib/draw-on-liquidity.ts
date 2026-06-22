import type { OhlcCandle } from "@/types/historical";
import {
  formatTradingDayDate,
  isTodayTradingDayCandle,
} from "@/lib/daily-trading-day";

/**
 * Previous-day-high/low (PDH/PDL) "draw on liquidity" + daily bias model.
 *
 * Shared rule set (single source of truth, mirrored in the C++ realtime
 * evaluator and the Python backtest service):
 *
 *   For day D: PDH = high(D-1), PDL = low(D-1), range = [PDL, PDH].
 *   - close > PDH                          -> displaced_up      (draw HIGH, bullish)
 *   - close < PDL                          -> displaced_down    (draw LOW,  bearish)
 *   - high >= PDH and low <= PDL (no disp) -> swept_both        (draw NONE, neutral)
 *   - high >= PDH (closed back inside)     -> reversal_from_high (draw LOW,  bearish)
 *   - low  <= PDL (closed back inside)     -> reversal_from_low  (draw HIGH, bullish)
 *   - otherwise                            -> inside            (draw NONE, neutral)
 *
 * The `draw`/`bias` produced for day D are forward-looking: they describe the
 * expected draw on liquidity for the *following* day.
 */

export type DailyOutcome =
  | "displaced_up"
  | "displaced_down"
  | "reversal_from_high"
  | "reversal_from_low"
  | "swept_both"
  | "inside";

export type BiasDirection = "bullish" | "bearish" | "neutral";

export type DrawTarget = "high" | "low" | "none";

export interface DayClassification {
  outcome: DailyOutcome;
  draw: DrawTarget;
  bias: BiasDirection;
}

export interface DayBias {
  /** Timestamp (ISO) of the classified day. */
  date: string;
  /** Prior day's high (the PDH that applied to this day). */
  pdh: number;
  /** Prior day's low (the PDL that applied to this day). */
  pdl: number;
  open: number;
  high: number;
  low: number;
  close: number;
  outcome: DailyOutcome;
  /** Draw on liquidity set for the NEXT day. */
  draw: DrawTarget;
  /** Bias set for the NEXT day. */
  bias: BiasDirection;
  sweptHigh: boolean;
  sweptLow: boolean;
  /** Closed beyond a level (true displacement). */
  displaced: boolean;
  /**
   * Whether this day reached the draw target the *prior* day pointed to.
   * null when the prior day produced no directional draw (or there is none).
   */
  drawHit: boolean | null;
}

export interface LiveBias {
  pdh: number;
  pdl: number;
  /** Bias for the current (forming) day, set by the last completed day. */
  bias: BiasDirection;
  /** Draw on liquidity for the current day. */
  draw: DrawTarget;
  /** Price level of the active draw target (PDH or PDL), null when neutral. */
  drawTargetPrice: number | null;
  /** Today has already traded through the PDH. */
  sweptHigh: boolean;
  /** Today has already traded through the PDL. */
  sweptLow: boolean;
  /** Current price/close is beyond the PDH (live displacement up). */
  displacedUp: boolean;
  /** Current price/close is beyond the PDL (live displacement down). */
  displacedDown: boolean;
  /** Whether the active draw target has been reached so far today. */
  drawReached: boolean;
  /**
   * True when today's forming daily bar (or merged live price on it) backs
   * sweep/reach flags. When false, sweep/reach are not inferred from price alone.
   */
  hasIntradayData: boolean;
}

/** Reference candles and outcome used to derive today's live bias. */
export interface LiveBiasDetails {
  /** UTC date (YYYY-MM-DD) of the candle that supplies PDH/PDL. */
  pdhReferenceDate: string;
  pdhReference: Pick<OhlcCandle, "open" | "high" | "low" | "close">;
  /** UTC date of the classified day that set today's bias/draw. */
  classifiedDate: string;
  classified: Pick<OhlcCandle, "open" | "high" | "low" | "close"> & {
    outcome: DailyOutcome;
  };
  /** Forming daily bar for today, when available and aligned to the UTC bucket. */
  todayForming: Pick<OhlcCandle, "timestamp" | "open" | "high" | "low" | "close"> | null;
}

const NEG_INF = Number.NEGATIVE_INFINITY;
const POS_INF = Number.POSITIVE_INFINITY;

function toMs(iso: string): number {
  return new Date(iso).getTime();
}

function sortedClosedDaily(candles: OhlcCandle[]): OhlcCandle[] {
  return candles
    .filter((c) => !c.is_forming)
    .slice()
    .sort((a, b) => toMs(a.timestamp) - toMs(b.timestamp));
}

/**
 * Classify one day versus the prior day's high/low. Returns the day's outcome
 * plus the forward-looking draw/bias for the following day.
 */
export function classifyDay(pdh: number, pdl: number, day: Pick<OhlcCandle, "high" | "low" | "close">): DayClassification {
  const sweptHigh = day.high >= pdh;
  const sweptLow = day.low <= pdl;
  const closedAbove = day.close > pdh;
  const closedBelow = day.close < pdl;

  if (closedAbove) {
    return { outcome: "displaced_up", draw: "high", bias: "bullish" };
  }
  if (closedBelow) {
    return { outcome: "displaced_down", draw: "low", bias: "bearish" };
  }
  if (sweptHigh && sweptLow) {
    return { outcome: "swept_both", draw: "none", bias: "neutral" };
  }
  if (sweptHigh) {
    return { outcome: "reversal_from_high", draw: "low", bias: "bearish" };
  }
  if (sweptLow) {
    return { outcome: "reversal_from_low", draw: "high", bias: "bullish" };
  }
  return { outcome: "inside", draw: "none", bias: "neutral" };
}

/**
 * Build the per-day bias series from daily candles. Each entry is a completed
 * day classified against the prior day, with `drawHit` reporting whether it
 * reached the draw target the previous day pointed to.
 */
export function computeBiasSeries(dailyCandles: OhlcCandle[]): DayBias[] {
  const closed = sortedClosedDaily(dailyCandles);
  const out: DayBias[] = [];

  for (let i = 1; i < closed.length; i += 1) {
    const prev = closed[i - 1];
    const day = closed[i];
    const pdh = prev.high;
    const pdl = prev.low;
    const { outcome, draw, bias } = classifyDay(pdh, pdl, day);

    const priorBias = out[out.length - 1];
    let drawHit: boolean | null = null;
    if (priorBias) {
      if (priorBias.draw === "high") {
        drawHit = day.high >= pdh;
      } else if (priorBias.draw === "low") {
        drawHit = day.low <= pdl;
      }
    }

    out.push({
      date: day.timestamp,
      pdh,
      pdl,
      open: day.open,
      high: day.high,
      low: day.low,
      close: day.close,
      outcome,
      draw,
      bias,
      sweptHigh: day.high >= pdh,
      sweptLow: day.low <= pdl,
      displaced: day.close > pdh || day.close < pdl,
      drawHit,
    });
  }

  return out;
}

/**
 * Live bias for the current (forming) day. The bias/draw are set by the last
 * completed day; sweep/displacement flags track today's running high/low and
 * live price in realtime.
 */
export function computeLiveBias(
  dailyCandles: OhlcCandle[],
  today: OhlcCandle | null | undefined,
  livePrice?: number,
): LiveBias | null {
  const closed = sortedClosedDaily(dailyCandles);
  if (closed.length < 1) {
    return null;
  }

  const lastDay = closed[closed.length - 1];
  const pdh = lastDay.high;
  const pdl = lastDay.low;

  let bias: BiasDirection = "neutral";
  let draw: DrawTarget = "none";
  if (closed.length >= 2) {
    const prev = closed[closed.length - 2];
    const classification = classifyDay(prev.high, prev.low, lastDay);
    bias = classification.bias;
    draw = classification.draw;
  }

  const validToday =
    today != null &&
    today.is_forming !== false &&
    isTodayTradingDayCandle(today);
  const hasLive = typeof livePrice === "number" && Number.isFinite(livePrice);
  const hasIntradayData = validToday;

  let todayHigh = NEG_INF;
  let todayLow = POS_INF;
  let close = lastDay.close;

  if (validToday) {
    todayHigh = today.high;
    todayLow = today.low;
    close = today.close;
    if (hasLive) {
      todayHigh = Math.max(todayHigh, livePrice as number);
      todayLow = Math.min(todayLow, livePrice as number);
      close = livePrice as number;
    }
  } else if (hasLive) {
    close = livePrice as number;
  }

  const sweptHigh =
    hasIntradayData && Number.isFinite(todayHigh) && todayHigh >= pdh;
  const sweptLow =
    hasIntradayData && Number.isFinite(todayLow) && todayLow <= pdl;
  const drawTargetPrice = draw === "high" ? pdh : draw === "low" ? pdl : null;
  const drawReached =
    hasIntradayData &&
    (draw === "high" ? sweptHigh : draw === "low" ? sweptLow : false);

  return {
    pdh,
    pdl,
    bias,
    draw,
    drawTargetPrice,
    sweptHigh,
    sweptLow,
    displacedUp: close > pdh,
    displacedDown: close < pdl,
    drawReached,
    hasIntradayData,
  };
}

/**
 * Diagnostic context for verifying bias/draw against the underlying daily candles.
 */
export function computeLiveBiasDetails(
  dailyCandles: OhlcCandle[],
  today: OhlcCandle | null | undefined,
): LiveBiasDetails | null {
  const closed = sortedClosedDaily(dailyCandles);
  if (closed.length < 1) {
    return null;
  }

  const lastDay = closed[closed.length - 1];
  let outcome: DailyOutcome = "inside";
  if (closed.length >= 2) {
    const prev = closed[closed.length - 2];
    outcome = classifyDay(prev.high, prev.low, lastDay).outcome;
  }

  const validToday =
    today != null &&
    today.is_forming !== false &&
    isTodayTradingDayCandle(today);

  return {
    pdhReferenceDate: formatTradingDayDate(lastDay.timestamp),
    pdhReference: {
      open: lastDay.open,
      high: lastDay.high,
      low: lastDay.low,
      close: lastDay.close,
    },
    classifiedDate: formatTradingDayDate(lastDay.timestamp),
    classified: {
      open: lastDay.open,
      high: lastDay.high,
      low: lastDay.low,
      close: lastDay.close,
      outcome,
    },
    todayForming: validToday
      ? {
          timestamp: today.timestamp,
          open: today.open,
          high: today.high,
          low: today.low,
          close: today.close,
        }
      : null,
  };
}

export function biasLabel(bias: BiasDirection): string {
  if (bias === "bullish") return "Bullish";
  if (bias === "bearish") return "Bearish";
  return "Range";
}

export function drawLabel(draw: DrawTarget): string {
  if (draw === "high") return "PDH";
  if (draw === "low") return "PDL";
  return "—";
}

export function outcomeLabel(outcome: DailyOutcome): string {
  switch (outcome) {
    case "displaced_up":
      return "Displaced up";
    case "displaced_down":
      return "Displaced down";
    case "reversal_from_high":
      return "Reversal from PDH";
    case "reversal_from_low":
      return "Reversal from PDL";
    case "swept_both":
      return "Swept both";
    case "inside":
      return "Inside range";
    default:
      return outcome;
  }
}
