import type { BacktestTrade } from "@/types/analytics";

export const TRADE_POSITION_OVERLAY_NAME = "fxTradePositionTv";
export const TRADE_POSITION_OVERLAY_ID = "fx-trade-position";

export function pipSizeForPair(pair: string): number {
  const compact = pair.replace(/[^a-z0-9]/gi, "").toUpperCase();
  return compact.endsWith("JPY") ? 0.01 : 0.0001;
}

export function pricePrecisionForPair(pair: string): number {
  const compact = pair.replace(/[^a-z0-9]/gi, "").toUpperCase();
  return compact.endsWith("JPY") ? 3 : 5;
}

function pipsBetween(from: number, to: number, pipSize: number): number {
  return Math.abs(to - from) / pipSize;
}

function pctBetween(from: number, to: number): number {
  if (from === 0) {
    return 0;
  }
  return (Math.abs(to - from) / Math.abs(from)) * 100;
}

export type PositionLabels = {
  targetLabel: string;
  stopLabel: string;
  centerLabel: string;
  pnlPositive: boolean | null;
  showTarget: boolean;
  showStop: boolean;
  showCenter: boolean;
};

export function formatPips(pips: number): string {
  return pips.toFixed(1);
}

export function computePositionLabels(
  pair: string,
  trade: Pick<BacktestTrade, "side" | "entry" | "sl" | "tp" | "rr">,
  lastClose?: number,
  visibility?: { target?: boolean; stop?: boolean; center?: boolean },
): PositionLabels {
  const pipSize = pipSizeForPair(pair);
  const precision = pricePrecisionForPair(pair);
  const risk = Math.abs(trade.entry - trade.sl);
  const reward = Math.abs(trade.tp - trade.entry);
  const plannedR = risk > 0 ? reward / risk : 0;
  const rr = trade.rr ?? plannedR;

  const targetPips = pipsBetween(trade.entry, trade.tp, pipSize);
  const stopPips = pipsBetween(trade.entry, trade.sl, pipSize);
  const targetPct = pctBetween(trade.entry, trade.tp);
  const stopPct = pctBetween(trade.entry, trade.sl);
  const targetDiff = Math.abs(trade.tp - trade.entry).toFixed(precision);
  const stopDiff = Math.abs(trade.sl - trade.entry).toFixed(precision);

  const targetLabel = `Target: ${targetDiff} (${targetPct.toFixed(3)}%) ${formatPips(targetPips)} pips · ${plannedR.toFixed(1)}R`;
  const stopLabel = `Stop: ${stopDiff} (${stopPct.toFixed(3)}%) ${formatPips(stopPips)} pips · 1R`;

  let centerLabel = `Risk/reward ${Number.isFinite(rr) ? Math.abs(rr).toFixed(1) : plannedR.toFixed(1)}:1`;
  let pnlPositive: boolean | null = null;
  if (typeof lastClose === "number" && Number.isFinite(lastClose) && stopPips > 0) {
    const signed =
      trade.side === "bullish" ? lastClose - trade.entry : trade.entry - lastClose;
    const pnlPips = signed / pipSize;
    const pnlR = risk > 0 ? signed / risk : 0;
    const sign = pnlPips >= 0 ? "+" : "";
    pnlPositive = signed >= 0;
    centerLabel = `PnL: ${sign}${formatPips(pnlPips)} pips (${sign}${pnlR.toFixed(2)}R) · R ${plannedR.toFixed(1)}:1`;
  }

  return {
    targetLabel,
    stopLabel,
    centerLabel,
    pnlPositive,
    showTarget: visibility?.target !== false,
    showStop: visibility?.stop !== false,
    showCenter: visibility?.center !== false,
  };
}
