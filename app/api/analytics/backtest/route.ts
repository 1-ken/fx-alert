import { NextRequest, NextResponse } from "next/server";
import { validateApiAuth } from "@/lib/api-auth";
import { normalizeClosedDailyCandles } from "@/lib/daily-trading-day";
import {
  ensureHistory,
  HistoryUpstreamError,
  toExportCandle,
} from "@/lib/history-ensure";
import type { BacktestStrategy } from "@/types/analytics";

const DAY_MS = 86_400_000;
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

    const analyticsUrl =
      process.env.ANALYTICS_SERVICE_URL?.trim() || "http://localhost:8100";
    const analyticsResponse = await fetch(`${analyticsUrl}/backtest`, {
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
    if (error instanceof HistoryUpstreamError) {
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
    candles: candles.map(toExportCandle),
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
    candles_1h: candles1h.map(toExportCandle),
    candles_5m: candles5m.map(toExportCandle),
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
    payload.candles = daily.map(toExportCandle);
  }

  return payload;
}

function shiftIso(iso: string | undefined, days: number): string | undefined {
  if (!iso) return undefined;
  return new Date(new Date(iso).getTime() + days * DAY_MS).toISOString();
}
