import { NextRequest, NextResponse } from "next/server";
import { validateApiAuth } from "@/lib/api-auth";
import { CHART_INTERVAL_OPTIONS, type ChartInterval } from "@/lib/chart-utils";
import {
  ensureHistory,
  HistoryUpstreamError,
  toExportCandle,
} from "@/lib/history-ensure";

const ALLOWED = new Set<string>(CHART_INTERVAL_OPTIONS);

/**
 * Fetch closed OHLC for one or more intervals and return JSON suitable for download.
 */
export async function POST(request: NextRequest) {
  const auth = await validateApiAuth();
  if (!auth.authenticated) return auth.response;

  let body: {
    pair?: string;
    start?: string;
    end?: string;
    intervals?: string[];
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
  if (!body.start || !body.end) {
    return NextResponse.json({ error: "start and end are required" }, { status: 400 });
  }

  const requested = Array.isArray(body.intervals) ? body.intervals : [];
  const intervals = Array.from(
    new Set(
      requested
        .map((value) => String(value).trim())
        .filter((value): value is ChartInterval => ALLOWED.has(value)),
    ),
  );
  if (intervals.length === 0) {
    return NextResponse.json(
      { error: "Select at least one timeframe" },
      { status: 400 },
    );
  }

  try {
    const candles: Record<string, ReturnType<typeof toExportCandle>[]> = {};
    const counts: Record<string, number> = {};
    for (const interval of intervals) {
      const series = await ensureHistory(pair, interval, body.start, body.end);
      candles[interval] = series.map(toExportCandle);
      counts[interval] = candles[interval].length;
    }

    return NextResponse.json({
      exported_at: new Date().toISOString(),
      pair,
      start: body.start,
      end: body.end,
      intervals,
      counts,
      candles,
    });
  } catch (error) {
    if (error instanceof HistoryUpstreamError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Candle export failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
