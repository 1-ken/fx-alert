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
const CHUNK_CONCURRENCY = 4;
const CHUNK_CACHE_TTL_MS = 5 * 60 * 1000;

type CachedChunk = { expires: number; candles: OhlcCandle[] };
const chunkCache = new Map<string, CachedChunk>();

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
 * Backtest proxy: pulls OHLC from the C++ observer (server-side, with the
 * user's token), then forwards candles to the stateless FastAPI analytics
 * service for the selected strategy.
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
    await fetchInterval(pair, "1d", shiftIso(body.start, -10), body.end, body.limit ?? 400),
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
  const [candles1h, candles5m] = await Promise.all([
    fetchChunked(pair, "1h", fetchStart, body.end, 20).then(dropForming),
    fetchChunked(pair, "5m", fetchStart, body.end, 14).then(dropForming),
  ]);

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
      await fetchInterval(pair, "1d", shiftIso(body.start, -10), body.end, 400),
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

async function fetchChunked(
  pair: string,
  interval: string,
  start: string | undefined,
  end: string | undefined,
  chunkDays: number,
): Promise<OhlcCandle[]> {
  if (!start || !end) {
    return fetchInterval(pair, interval, start, end, 5000);
  }

  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return fetchInterval(pair, interval, start, end, 5000);
  }

  const ranges: Array<{ start: string; end: string }> = [];
  for (let from = startMs; from < endMs; from += chunkDays * DAY_MS) {
    const to = Math.min(from + chunkDays * DAY_MS, endMs);
    ranges.push({
      start: new Date(from).toISOString(),
      end: new Date(to).toISOString(),
    });
  }

  const merged: OhlcCandle[] = [];
  for (let index = 0; index < ranges.length; index += CHUNK_CONCURRENCY) {
    const batch = ranges.slice(index, index + CHUNK_CONCURRENCY);
    const chunks = await Promise.all(
      batch.map((range) =>
        fetchInterval(pair, interval, range.start, range.end, 5000),
      ),
    );
    for (const chunk of chunks) {
      merged.push(...chunk);
    }
  }
  return dedupe(merged);
}

async function fetchInterval(
  pair: string,
  interval: string,
  start: string | undefined,
  end: string | undefined,
  limit: number,
): Promise<OhlcCandle[]> {
  const cacheKey =
    start && end ? `${pair}|${interval}|${start}|${end}|${limit}` : null;
  if (cacheKey) {
    const cached = chunkCache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      return cached.candles;
    }
    if (cached) {
      chunkCache.delete(cacheKey);
    }
  }

  const params = new URLSearchParams();
  params.set("pair", pair);
  params.set("interval", interval);
  params.set("limit", String(limit));
  if (start) params.set("start", start);
  if (end) params.set("end", end);

  const response = await proxyObserverRequest(
    `${API_ENDPOINTS.STREAMING.HISTORICAL_OHLC}?${params.toString()}`,
  );
  if (!response.ok) {
    const text = await response.text();
    throw new UpstreamError(
      readableError(text, `Failed to load ${interval} candles`),
      response.status,
    );
  }

  const ohlc = (await response.json()) as OhlcResponse;
  const candles = ohlc.candles ?? [];
  if (cacheKey) {
    chunkCache.set(cacheKey, {
      expires: Date.now() + CHUNK_CACHE_TTL_MS,
      candles,
    });
  }
  return candles;
}

function dedupe(candles: OhlcCandle[]): OhlcCandle[] {
  const byTime = new Map<string, OhlcCandle>();
  for (const candle of candles) {
    byTime.set(candle.timestamp, candle);
  }
  return Array.from(byTime.values()).sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp),
  );
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
