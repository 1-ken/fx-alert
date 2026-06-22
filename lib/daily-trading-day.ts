import type { OhlcCandle } from "@/types/historical";

export const TRADING_DAY_MS = 86_400_000;

/**
 * cTrader D1 bars are often timestamped at the broker's daily open (evening UTC
 * of the previous calendar day). Round the open to the nearest UTC midnight to
 * get the canonical trading-day key.
 */
export function normalizeTradingDayMs(iso: string): number {
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) {
    return Number.NaN;
  }
  return Math.round(ts / TRADING_DAY_MS) * TRADING_DAY_MS;
}

/** ISO timestamp at the normalized trading-day midnight (UTC). */
export function normalizeTradingDayIso(iso: string): string {
  const normMs = normalizeTradingDayMs(iso);
  return new Date(normMs).toISOString();
}

/** UTC midnight (ms) for the calendar day containing `at` (default: now). */
export function todayTradingDayStartMs(at: Date = new Date()): number {
  return Math.floor(
    Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()),
  );
}

/** YYYY-MM-DD trading-day label from a normalized ISO timestamp. */
export function formatTradingDayDate(iso: string): string {
  return iso.slice(0, 10);
}

/** Human-readable trading day, e.g. "19 Jun 2026". */
export function formatTradingDayLabel(iso: string): string {
  const normMs = normalizeTradingDayMs(iso);
  if (!Number.isFinite(normMs)) {
    return iso.slice(0, 10);
  }
  const d = new Date(normMs);
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/**
 * Normalize closed daily candles to trading-day timestamps, dedupe by day, and
 * drop today's still-forming trading day.
 */
export function normalizeClosedDailyCandles(
  candles: OhlcCandle[],
  at: Date = new Date(),
): OhlcCandle[] {
  const todayStartMs = todayTradingDayStartMs(at);
  const byDay = new Map<number, OhlcCandle>();

  for (const candle of candles) {
    if (candle.is_forming) {
      continue;
    }
    const normMs = normalizeTradingDayMs(candle.timestamp);
    if (!Number.isFinite(normMs) || normMs >= todayStartMs) {
      continue;
    }
    byDay.set(normMs, {
      ...candle,
      timestamp: new Date(normMs).toISOString(),
      is_forming: false,
    });
  }

  return Array.from(byDay.entries())
    .sort(([a], [b]) => a - b)
    .map(([, candle]) => candle);
}

/** Normalize a forming daily candle to its trading-day timestamp. */
export function normalizeFormingDailyCandle(candle: OhlcCandle): OhlcCandle {
  const normMs = normalizeTradingDayMs(candle.timestamp);
  return {
    ...candle,
    timestamp: Number.isFinite(normMs)
      ? new Date(normMs).toISOString()
      : candle.timestamp,
    is_forming: candle.is_forming !== false,
  };
}

/** True when the candle belongs to today's trading day (after normalization). */
export function isTodayTradingDayCandle(
  candle: OhlcCandle,
  at: Date = new Date(),
): boolean {
  const normMs = normalizeTradingDayMs(candle.timestamp);
  return Number.isFinite(normMs) && normMs === todayTradingDayStartMs(at);
}
