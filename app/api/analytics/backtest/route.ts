import { NextRequest, NextResponse } from "next/server";
import { API_ENDPOINTS } from "@/lib/constants";
import { validateApiAuth } from "@/lib/api-auth";
import { proxyObserverRequest } from "@/lib/observer-api";

const ANALYTICS_SERVICE_URL =
  process.env.ANALYTICS_SERVICE_URL?.trim() || "http://localhost:8100";

interface OhlcCandleResponse {
  candles?: Array<{
    timestamp: string;
    open: number;
    high: number;
    low: number;
    close: number;
    is_forming?: boolean;
  }>;
}

/**
 * Backtest proxy: pulls daily candles from the C++ observer (server-side, with
 * the user's token), then forwards them to the stateless FastAPI analytics
 * service for draw-on-liquidity backtesting.
 */
export async function POST(request: NextRequest) {
  const auth = await validateApiAuth();
  if (!auth.authenticated) return auth.response;

  let body: { pair?: string; start?: string; end?: string; limit?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const pair = (body.pair ?? "").trim();
  if (!pair) {
    return NextResponse.json({ error: "pair is required" }, { status: 400 });
  }

  // Fetch a calendar buffer before the requested start so the day immediately
  // before the window (e.g. Friday for a Monday start) is available to seed the
  // first in-range day's previous-day high/low. 10 days safely covers weekends
  // and long holiday gaps.
  const SEED_BUFFER_DAYS = 10;
  const fetchStart = body.start
    ? new Date(
        new Date(body.start).getTime() - SEED_BUFFER_DAYS * 86_400_000,
      ).toISOString()
    : undefined;

  const params = new URLSearchParams();
  params.set("pair", pair);
  params.set("interval", "1d");
  params.set("limit", String(body.limit ?? 400));
  if (fetchStart) params.set("start", fetchStart);
  if (body.end) params.set("end", body.end);

  const ohlcResponse = await proxyObserverRequest(
    `${API_ENDPOINTS.STREAMING.HISTORICAL_OHLC}?${params.toString()}`,
  );
  if (!ohlcResponse.ok) {
    const text = await ohlcResponse.text();
    return new NextResponse(text || JSON.stringify({ error: "Failed to load candles" }), {
      status: ohlcResponse.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const ohlc = (await ohlcResponse.json()) as OhlcCandleResponse;
  // cTrader D1 bars are timestamped at the broker's daily open (evening UTC of
  // the previous calendar day), so normalize each candle to its trading day by
  // rounding the open to the nearest UTC midnight. This maps an evening open
  // (e.g. Thu 22:00) up to the correct trading date (Fri) and leaves a true
  // midnight-aligned broker unchanged. Sessions that open Sunday evening map to
  // Monday, so weekends never produce a candle.
  const DAY_MS = 86_400_000;
  const todayMidnightMs = Math.floor(Date.now() / DAY_MS) * DAY_MS;
  const candles = (ohlc.candles ?? [])
    .filter((c) => !c.is_forming)
    .map((c) => {
      const normMs = Math.round(new Date(c.timestamp).getTime() / DAY_MS) * DAY_MS;
      return { normMs, open: c.open, high: c.high, low: c.low, close: c.close };
    })
    // Drop the current, still-forming trading day (its session has not closed).
    .filter((c) => Number.isFinite(c.normMs) && c.normMs < todayMidnightMs)
    .map((c) => ({
      timestamp: new Date(c.normMs).toISOString(),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

  if (candles.length < 2) {
    return NextResponse.json(
      { error: "Not enough daily candles for the selected range." },
      { status: 422 },
    );
  }

  try {
    const analyticsResponse = await fetch(`${ANALYTICS_SERVICE_URL}/backtest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pair, candles, start: body.start, end: body.end }),
      cache: "no-store",
    });

    const text = await analyticsResponse.text();
    return new NextResponse(text, {
      status: analyticsResponse.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `Analytics service unreachable: ${error.message}`
            : "Analytics service unreachable",
      },
      { status: 502 },
    );
  }
}
