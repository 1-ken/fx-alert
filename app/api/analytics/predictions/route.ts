import { NextRequest, NextResponse } from "next/server";
import { API_ENDPOINTS } from "@/lib/constants";
import { validateApiAuth } from "@/lib/api-auth";
import { proxyObserverRequest } from "@/lib/observer-api";
import { extractFormingCandle } from "@/lib/chart-utils";
import {
  normalizeClosedDailyCandles,
  normalizeFormingDailyCandle,
} from "@/lib/daily-trading-day";
import {
  buildTodayPredictionRecord,
  buildTodayScorecard,
  todayTradingDayKey,
  type PredictionRecord,
  type PredictionScorecard,
} from "@/lib/prediction-scorecard";
import type { OhlcResponse, OhlcWithFormingResponse } from "@/types/historical";

const MAX_CONCURRENCY = 5;
const TODAY_OHLC_LIMIT = 10;
const SERVER_CACHE_TTL_MS = 5 * 60 * 1000;

const serverCache = new Map<string, { fetchedAt: number; data: PredictionScorecard }>();

function normalizePairKey(pair: string): string {
  return pair.replace(/[^a-z0-9]/gi, "").toUpperCase();
}

function cacheKeyForPairs(pairs: string[]): string {
  return `${todayTradingDayKey()}:${[...pairs].sort().join(",")}`;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await fn(items[current]);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function fetchTodayPredictionRecord(pair: string): Promise<PredictionRecord> {
  const params = new URLSearchParams({
    pair,
    interval: "1d",
    limit: String(TODAY_OHLC_LIMIT),
  });

  const [closedRes, formingRes] = await Promise.all([
    proxyObserverRequest(`${API_ENDPOINTS.STREAMING.HISTORICAL_OHLC}?${params}`),
    proxyObserverRequest(
      `${API_ENDPOINTS.STREAMING.HISTORICAL_OHLC_WITH_FORMING}?${params}`,
    ),
  ]);

  if (!closedRes.ok) {
    return buildTodayPredictionRecord(pair, [], null);
  }

  const closedJson = (await closedRes.json()) as OhlcResponse;
  const formingJson = formingRes.ok
    ? ((await formingRes.json()) as OhlcWithFormingResponse)
    : null;

  const dailyCandles = normalizeClosedDailyCandles(closedJson.candles ?? []);
  const forming = extractFormingCandle(formingJson ?? undefined);
  const todayCandle = forming ? normalizeFormingDailyCandle(forming) : null;

  return buildTodayPredictionRecord(pair, dailyCandles, todayCandle);
}

/**
 * Today-only draw-on-liquidity prediction scorecard (hit / miss / pending).
 */
export async function POST(request: NextRequest) {
  const auth = await validateApiAuth();
  if (!auth.authenticated) {
    return auth.response;
  }

  let body: { pairs?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawPairs = body.pairs ?? [];
  const pairs = Array.from(
    new Set(rawPairs.map((p) => normalizePairKey(p)).filter(Boolean)),
  );

  if (pairs.length === 0) {
    return NextResponse.json({ error: "pairs is required" }, { status: 400 });
  }

  const key = cacheKeyForPairs(pairs);
  const cached = serverCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < SERVER_CACHE_TTL_MS) {
    return NextResponse.json(cached.data);
  }

  const records = await mapWithConcurrency(pairs, MAX_CONCURRENCY, (pair) =>
    fetchTodayPredictionRecord(pair),
  );

  const scorecard = buildTodayScorecard(records);
  serverCache.set(key, { fetchedAt: Date.now(), data: scorecard });
  return NextResponse.json(scorecard);
}
