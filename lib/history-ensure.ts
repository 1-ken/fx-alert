import { API_ENDPOINTS } from "@/lib/constants";
import { proxyObserverRequest } from "@/lib/observer-api";
import type { OhlcCandle, OhlcResponse } from "@/types/historical";

const ANALYTICS_SERVICE_URL =
  process.env.ANALYTICS_SERVICE_URL?.trim() || "http://localhost:8100";

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;
const OBSERVER_LIMIT = 5000;
const RATE_LIMIT_BACKOFF_MS = 2000;

export class HistoryUpstreamError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export type HistoryWindow = { start: string; end: string };

export type ExportCandle = {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
};

const INTERVAL_MS: Record<string, number> = {
  "1m": MINUTE_MS,
  "5m": 5 * MINUTE_MS,
  "15m": 15 * MINUTE_MS,
  "30m": 30 * MINUTE_MS,
  "1h": 60 * MINUTE_MS,
  "4h": 4 * 60 * MINUTE_MS,
  "1d": DAY_MS,
};

export function toExportCandle(candle: OhlcCandle): ExportCandle {
  return {
    timestamp: candle.timestamp,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
  };
}

function dropForming(candles: OhlcCandle[]): OhlcCandle[] {
  return candles.filter((candle) => candle.is_forming !== true);
}

/**
 * Ask analytics which closed ranges are missing, pull gaps from the observer,
 * store them, then return the closed series for [start, end].
 */
export async function ensureHistory(
  pair: string,
  interval: string,
  start: string | undefined,
  end: string | undefined,
): Promise<OhlcCandle[]> {
  if (!start || !end) {
    return fetchObserver(pair, interval, start, end);
  }

  const closed = closedEnd(interval, end);
  if (new Date(start).getTime() >= new Date(closed).getTime()) {
    return [];
  }

  const gaps = await historyGaps(pair, interval, start, closed);
  for (const gap of gaps) {
    for (const chunk of splitWindow(gap.start, gap.end, chunkDaysFor(interval))) {
      const candles = await fetchObserver(pair, interval, chunk.start, chunk.end);
      await storeWindow(pair, interval, chunk.start, chunk.end, candles);
    }
  }
  return readHistory(pair, interval, start, closed);
}

export function closedEnd(interval: string, end: string, now = Date.now()): string {
  const requested = new Date(end).getTime();
  if (!Number.isFinite(requested)) {
    return end;
  }
  return new Date(Math.min(requested, lastCompletedOpen(interval, now))).toISOString();
}

function lastCompletedOpen(interval: string, nowMs: number): number {
  const period = INTERVAL_MS[interval] ?? 5 * MINUTE_MS;
  if (interval === "1d") {
    const now = new Date(nowMs);
    return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  }
  return Math.floor(nowMs / period) * period;
}

function chunkDaysFor(interval: string): number {
  if (interval === "1m") return 3;
  if (interval === "5m") return 14;
  if (interval === "15m") return 40;
  if (interval === "30m") return 80;
  if (interval === "1h") return 20;
  if (interval === "4h") return 120;
  return 365;
}

export function splitWindow(
  start: string,
  end: string,
  chunkDays: number,
): HistoryWindow[] {
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return [];
  }
  const ranges: HistoryWindow[] = [];
  for (let from = startMs; from < endMs; from += chunkDays * DAY_MS) {
    const to = Math.min(from + chunkDays * DAY_MS, endMs);
    ranges.push({
      start: new Date(from).toISOString(),
      end: new Date(to).toISOString(),
    });
  }
  return ranges;
}

async function historyGaps(
  pair: string,
  interval: string,
  start: string,
  end: string,
): Promise<HistoryWindow[]> {
  const payload = (await analyticsJson("/history/gaps", {
    method: "POST",
    body: JSON.stringify({ pair, interval, start, end }),
  })) as { gaps?: HistoryWindow[] };
  return payload.gaps ?? [];
}

async function storeWindow(
  pair: string,
  interval: string,
  start: string,
  end: string,
  candles: OhlcCandle[],
): Promise<void> {
  await analyticsJson("/history/candles", {
    method: "POST",
    body: JSON.stringify({
      pair,
      interval,
      start,
      end,
      candles: candles.map(toExportCandle),
    }),
  });
}

async function readHistory(
  pair: string,
  interval: string,
  start: string,
  end: string,
): Promise<OhlcCandle[]> {
  const params = new URLSearchParams({ pair, interval, start, end });
  const payload = (await analyticsJson(`/history/candles?${params.toString()}`)) as {
    candles?: Array<Pick<OhlcCandle, "timestamp" | "open" | "high" | "low" | "close">>;
  };
  return (payload.candles ?? []).map((candle) => ({
    timestamp: candle.timestamp,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: 0,
    is_forming: false,
  }));
}

async function analyticsJson(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(`${ANALYTICS_SERVICE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!response.ok) {
    const text = await response.text();
    throw new HistoryUpstreamError(
      readableError(text, "Analytics history request failed"),
      response.status,
    );
  }
  return response.json();
}

export async function fetchObserver(
  pair: string,
  interval: string,
  start: string | undefined,
  end: string | undefined,
): Promise<OhlcCandle[]> {
  const load = () => {
    const params = new URLSearchParams();
    params.set("pair", pair);
    params.set("interval", interval);
    params.set("limit", String(OBSERVER_LIMIT));
    if (start) params.set("start", start);
    if (end) params.set("end", end);
    return proxyObserverRequest(
      `${API_ENDPOINTS.STREAMING.HISTORICAL_OHLC}?${params.toString()}`,
    );
  };

  let response = await load();
  if (response.status === 429) {
    await sleep(RATE_LIMIT_BACKOFF_MS);
    response = await load();
  }
  if (!response.ok) {
    const text = await response.text();
    throw new HistoryUpstreamError(
      readableError(text, `Failed to load ${interval} candles`),
      response.status,
    );
  }

  const ohlc = (await response.json()) as OhlcResponse;
  const candles = dropForming(ohlc.candles ?? []);
  if (candles.length >= OBSERVER_LIMIT) {
    throw new HistoryUpstreamError(`History response for ${interval} was truncated`, 502);
  }
  return candles;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readableError(text: string, fallback: string): string {
  try {
    const parsed = JSON.parse(text) as { error?: string };
    if (typeof parsed.error === "string" && parsed.error) return parsed.error;
  } catch {
    // Observer responses are not always JSON.
  }
  return text || fallback;
}
