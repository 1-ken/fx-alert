import {
  formatTradingDayDate,
  todayTradingDayStartMs,
} from "@/lib/daily-trading-day";
import {
  computeBiasSeries,
  computeLiveBias,
  computeLiveBiasDetails,
  type BiasDirection,
  type DayBias,
  type DrawTarget,
  type LiveBias,
  type LiveBiasDetails,
} from "@/lib/draw-on-liquidity";
import type { OhlcCandle } from "@/types/historical";

export type PredictionStatus = "hit" | "miss" | "pending" | "none";

export interface PredictionRecord {
  pair: string;
  tradingDay: string;
  predictedBias: BiasDirection;
  predictedDraw: DrawTarget;
  drawTargetPrice: number | null;
  status: PredictionStatus;
  setByDay: string;
  actualHigh?: number;
  actualLow?: number;
}

export interface PredictionSummary {
  hit: number;
  miss: number;
  pending: number;
  none: number;
  hit_rate: number;
  evaluated_days: number;
}

export interface PredictionScorecard {
  generated_at: string;
  days: number;
  summary: PredictionSummary;
  records: PredictionRecord[];
}

function drawTargetPriceForDay(
  predictedDraw: DrawTarget,
  day: Pick<DayBias, "pdh" | "pdl">,
): number | null {
  if (predictedDraw === "high") {
    return day.pdh;
  }
  if (predictedDraw === "low") {
    return day.pdl;
  }
  return null;
}

/**
 * Map one classified day to a scorecard row using the prior day's forecast.
 */
export function dayBiasToPredictionRecord(
  pair: string,
  day: DayBias,
  prior: DayBias,
): PredictionRecord {
  const predictedDraw = prior.draw;
  const predictedBias = prior.bias;
  let status: PredictionStatus = "none";
  if (day.drawHit === true) {
    status = "hit";
  } else if (day.drawHit === false) {
    status = "miss";
  }

  return {
    pair,
    tradingDay: formatTradingDayDate(day.date),
    predictedBias,
    predictedDraw,
    drawTargetPrice: drawTargetPriceForDay(predictedDraw, day),
    status,
    setByDay: formatTradingDayDate(prior.date),
    actualHigh: day.high,
    actualLow: day.low,
  };
}

/** YYYY-MM-DD key for the current UTC trading day. */
export function todayTradingDayKey(at: Date = new Date()): string {
  return formatTradingDayDate(new Date(todayTradingDayStartMs(at)).toISOString());
}

/**
 * Build today's live prediction row (pending or early hit).
 */
export function buildPendingRecord(
  pair: string,
  live: LiveBias,
  details: LiveBiasDetails | null,
): PredictionRecord | null {
  if (live.draw === "none") {
    return null;
  }

  const todayMs = formatTradingDayDate(
    details?.todayForming?.timestamp ??
      new Date().toISOString(),
  );
  const setByDay = details?.classifiedDate ?? todayMs;

  let status: PredictionStatus = "pending";
  if (live.drawReached) {
    status = "hit";
  }

  return {
    pair,
    tradingDay: todayMs,
    predictedBias: live.bias,
    predictedDraw: live.draw,
    drawTargetPrice: live.drawTargetPrice,
    status,
    setByDay,
    actualHigh: details?.todayForming?.high,
    actualLow: details?.todayForming?.low,
  };
}

/**
 * Single today-only prediction row for one pair (always returns one record).
 */
export function buildTodayPredictionRecord(
  pair: string,
  dailyCandles: OhlcCandle[],
  todayCandle: OhlcCandle | null | undefined,
  livePrice?: number,
): PredictionRecord {
  const todayKey = todayTradingDayKey();
  const live = computeLiveBias(dailyCandles, todayCandle, livePrice);
  const details = computeLiveBiasDetails(dailyCandles, todayCandle);

  if (!live) {
    return {
      pair,
      tradingDay: todayKey,
      predictedBias: "neutral",
      predictedDraw: "none",
      drawTargetPrice: null,
      status: "none",
      setByDay: details?.classifiedDate ?? todayKey,
    };
  }

  if (live.draw !== "none") {
    const pending = buildPendingRecord(pair, live, details);
    if (pending) {
      return { ...pending, tradingDay: todayKey };
    }
  }

  return {
    pair,
    tradingDay: todayKey,
    predictedBias: live.bias,
    predictedDraw: live.draw,
    drawTargetPrice: live.drawTargetPrice,
    status: "none",
    setByDay: details?.classifiedDate ?? todayKey,
    actualHigh: details?.todayForming?.high,
    actualLow: details?.todayForming?.low,
  };
}

/**
 * Convert bias history + optional live state into scorecard rows for one pair.
 */
export function buildPairPredictionRecords(
  pair: string,
  dailyCandles: OhlcCandle[],
  todayCandle: OhlcCandle | null | undefined,
  livePrice?: number,
  days = 30,
): PredictionRecord[] {
  const series = computeBiasSeries(dailyCandles);
  const records: PredictionRecord[] = [];

  for (let i = 1; i < series.length; i += 1) {
    records.push(dayBiasToPredictionRecord(pair, series[i], series[i - 1]));
  }

  const live = computeLiveBias(dailyCandles, todayCandle, livePrice);
  const details = computeLiveBiasDetails(dailyCandles, todayCandle);
  const pending = live ? buildPendingRecord(pair, live, details) : null;

  if (pending) {
    const idx = records.findIndex((r) => r.tradingDay === pending.tradingDay);
    if (idx >= 0) {
      records[idx] = pending;
    } else {
      records.push(pending);
    }
  }

  records.sort((a, b) => b.tradingDay.localeCompare(a.tradingDay));
  return records.slice(0, pending ? days + 1 : days);
}

/** Aggregate hit/miss/pending counts across all records. */
export function summarizePredictions(records: PredictionRecord[]): PredictionSummary {
  let hit = 0;
  let miss = 0;
  let pending = 0;
  let none = 0;

  for (const row of records) {
    if (row.status === "hit") {
      hit += 1;
    } else if (row.status === "miss") {
      miss += 1;
    } else if (row.status === "pending") {
      pending += 1;
    } else {
      none += 1;
    }
  }

  const evaluated = hit + miss;
  const hit_rate = evaluated > 0 ? Math.round((1000 * hit) / evaluated) / 10 : 0;

  return {
    hit,
    miss,
    pending,
    none,
    hit_rate,
    evaluated_days: evaluated,
  };
}

export function buildPredictionScorecard(
  pairRecords: PredictionRecord[],
  days: number,
): PredictionScorecard {
  const records = [...pairRecords].sort((a, b) => b.tradingDay.localeCompare(a.tradingDay));
  return {
    generated_at: new Date().toISOString(),
    days,
    summary: summarizePredictions(records),
    records,
  };
}

export function mergePairRecords(
  batches: PredictionRecord[][],
  days: number,
): PredictionScorecard {
  const flat = batches.flat();
  return buildPredictionScorecard(flat, days);
}

/** Merge today-only pair rows into a scorecard (one row per pair). */
export function buildTodayScorecard(records: PredictionRecord[]): PredictionScorecard {
  const sorted = [...records].sort((a, b) => a.pair.localeCompare(b.pair));
  return {
    generated_at: new Date().toISOString(),
    days: 1,
    summary: summarizePredictions(sorted),
    records: sorted,
  };
}

export function pairToInstrumentSlug(pair: string): string {
  return pair.replace(/[^a-z0-9]/gi, "").toUpperCase();
}

export function predictionStatusLabel(status: PredictionStatus): string {
  switch (status) {
    case "hit":
      return "Right";
    case "miss":
      return "Wrong";
    case "pending":
      return "Pending";
    default:
      return "No draw";
  }
}
