import { NextRequest, NextResponse } from "next/server";
import { API_ENDPOINTS } from "@/lib/constants";
import { validateApiAuth } from "@/lib/api-auth";
import { proxyObserverRequest } from "@/lib/observer-api";
import { normalizeClosedDailyCandles } from "@/lib/daily-trading-day";
import type { OhlcCandle, OhlcResponse } from "@/types/historical";
import type { BacktestStrategy } from "@/types/analytics";

const ANALYTICS_SERVICE_URL =
  process.env.ANALYTICS_SERVICE_URL?.trim() || "http://localhost:8100";

const DAY_MS = 86_400_000;
const FIVE_MIN_MS = 5 * 60 * 1000;
const OBSERVER_LIMIT = 5000;
const RATE_LIMIT_BACKOFF_MS = 2000;

class UpstreamError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
const STRATEGIES = new Set<BacktestStrategy>([
  "draw_on_liquidity",
  "liquidity_sweep",
  "pdhl_cisd",
]);

/**
 * Backtest proxy: asks analytics which closed ranges are already stored, pulls
 * only those gaps from the C++ observer, then forwards the stored candles.
 */
export async function POST(request: NextRequest) {
  const auth = await validateApiAuth();
  if (!auth.authenticated) return auth.response;

  let body: {
    pair?: string;
    strategy?: string;
    side?: string;
    start?: string;
    end?: string;
    limit?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const pair = (body.pair ?? "").trim();
  if (!pair) {
    return NextResponse.json({ error: "pair is required" }, { status: 400 });
  }

  const strategy = (body.strategy ?? "draw_on_liquidity") as BacktestStrategy;
  if (!STRATEGIES.has(strategy)) {
    return NextResponse.json({ error: "Unknown strategy" }, { status: 400 });
  }

  try {
    const payload =
      strategy === "liquidity_sweep" || strategy === "pdhl_cisd"
        ? await tradePayload(pair, strategy, body)
        : await drawPayload(pair, body);

    const analyticsResponse = await fetch(`${ANALYTICS_SERVICE_URL}/backtest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    const text = await analyticsResponse.text();
    return new NextResponse(text, {
      status: analyticsResponse.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    if (error instanceof UpstreamError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Backtest failed";
    const status = message.startsWith("Not enough") ? 422 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}

async function drawPayload(
  pair: string,
  body: { start?: string; end?: string; limit?: number },
) {
  const candles = normalizeClosedDailyCandles(
    await ensureHistory(pair, "1d", shiftIso(body.start, -10), body.end),
  );
  if (candles.length < 2) {
    throw new Error("Not enough daily candles for the selected range.");
  }
  return {
    pair,
    strategy: "draw_on_liquidity" as const,
    candles: candles.map(toCandle),
    start: body.start,
    end: body.end,
  };
}

function requestedSide(side: string | undefined): "all" | "bullish" | "bearish" {
  if (side === "bullish" || side === "bearish") {
    return side;
  }
  return "all";
}

async function tradePayload(
  pair: string,
  strategy: "liquidity_sweep" | "pdhl_cisd",
  body: { start?: string; end?: string; side?: string },
) {
  const fetchStart = shiftIso(body.start, -2);
  const candles1h = await ensureHistory(pair, "1h", fetchStart, body.end);
  const candles5m = await ensureHistory(pair, "5m", fetchStart, body.end);

  if (candles1h.length < 2 || candles5m.length < 3) {
    throw new Error("Not enough 1h and 5m candles for the selected range.");
  }

  const payload: Record<string, unknown> = {
    pair,
    strategy,
    side: requestedSide(body.side),
    candles_1h: candles1h.map(toCandle),
    candles_5m: candles5m.map(toCandle),
    start: body.start,
    end: body.end,
  };

  if (strategy === "pdhl_cisd") {
    const daily = normalizeClosedDailyCandles(
      await ensureHistory(pair, "1d", shiftIso(body.start, -10), body.end),
    );
    if (daily.length < 2) {
      throw new Error("Not enough daily candles to compute previous-day high and low.");
    }
    payload.candles = daily.map(toCandle);
  }

  return payload;
}

function toCandle(candle: OhlcCandle) {
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

function shiftIso(iso: string | undefined, days: number): string | undefined {
  if (!iso) return undefined;
  return new Date(new Date(iso).getTime() + days * DAY_MS).toISOString();
}

type HistoryWindow = { start: string; end: string };

async function ensureHistory(
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

function closedEnd(interval: string, end: string, now = Date.now()): string {
  const requested = new Date(end).getTime();
  if (!Number.isFinite(requested)) {
    return end;
  }
  return new Date(Math.min(requested, lastCompletedOpen(interval, now))).toISOString();
}

function lastCompletedOpen(interval: string, nowMs: number): number {
  const now = new Date(nowMs);
  if (interval === "1d") {
    return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  }
  if (interval === "1h") {
    return Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      now.getUTCHours(),
    );
  }
  return Math.floor(nowMs / FIVE_MIN_MS) * FIVE_MIN_MS;
}

function chunkDaysFor(interval: string): number {
  if (interval === "5m") return 14;
  if (interval === "1h") return 20;
  return 365;
}

function splitWindow(start: string, end: string, chunkDays: number): HistoryWindow[] {
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
      candles: candles.map(toCandle),
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
    throw new UpstreamError(
      readableError(text, "Analytics history request failed"),
      response.status,
    );
  }
  return response.json();
}

async function fetchObserver(
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
    throw new UpstreamError(
      readableError(text, `Failed to load ${interval} candles`),
      response.status,
    );
  }

  const ohlc = (await response.json()) as OhlcResponse;
  const candles = dropForming(ohlc.candles ?? []);
  if (candles.length >= OBSERVER_LIMIT) {
    throw new UpstreamError(`History response for ${interval} was truncated`, 502);
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
