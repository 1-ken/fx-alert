import { isTradeBacktest, type AnyBacktestResult, type BacktestOhlcBar } from "@/types/analytics";

function compactPair(pair: string): string {
  return pair.replace(/[^a-z0-9]/gi, "").toUpperCase() || "PAIR";
}

export function backtestExportFilename(
  strategy: string,
  pair: string,
  start?: string | null,
  end?: string | null,
): string {
  const from = (start ?? "all").slice(0, 10);
  const to = (end ?? "all").slice(0, 10);
  return `${strategy}-${compactPair(pair)}-${from}-${to}.json`;
}

export function candlesExportFilename(
  pair: string,
  start?: string | null,
  end?: string | null,
  intervals?: string[],
): string {
  const from = (start ?? "all").slice(0, 10);
  const to = (end ?? "all").slice(0, 10);
  const tfs = (intervals ?? []).join("-") || "ohlc";
  return `candles-${compactPair(pair)}-${from}-${to}-${tfs}.json`;
}

export function sweepExportFilename(
  pair: string,
  start?: string | null,
  end?: string | null,
): string {
  return backtestExportFilename("liquidity-sweep", pair, start, end);
}

function candleKey(bar: BacktestOhlcBar): string {
  return bar.timestamp;
}

function collectTradeCandles(result: AnyBacktestResult): BacktestOhlcBar[] {
  if (!isTradeBacktest(result)) {
    return result.series.map((day) => ({
      timestamp: day.date,
      open: day.open,
      high: day.high,
      low: day.low,
      close: day.close,
    }));
  }

  const byTime = new Map<string, BacktestOhlcBar>();
  const add = (bars: BacktestOhlcBar[] | undefined) => {
    for (const bar of bars ?? []) {
      byTime.set(candleKey(bar), bar);
    }
  };
  for (const trade of result.trades) {
    const context = trade.context;
    if (!context) {
      continue;
    }
    add(context.candles_1h);
    add(context.candles_5m);
    add(context.candles_1h_prev_day);
    add(context.candles_5m_prev_day);
    if (context.take) {
      add([context.take]);
    }
    if (context.cisd_1h) {
      add([context.cisd_1h]);
    }
    if (context.cisd) {
      add([context.cisd]);
    }
  }
  return Array.from(byTime.values()).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

function sideFilterOf(result: AnyBacktestResult): string | null {
  if (!isTradeBacktest(result)) {
    return null;
  }
  if (result.side_filter) {
    return result.side_filter;
  }
  const rules = result.rules;
  if (rules && "side_filter" in rules && rules.side_filter) {
    return rules.side_filter;
  }
  return null;
}

export function buildBacktestExportPayload(result: AnyBacktestResult, exportedAt: string) {
  const candles = collectTradeCandles(result);
  if (isTradeBacktest(result)) {
    return {
      exported_at: exportedAt,
      pair: result.pair,
      strategy: result.strategy,
      side_filter: sideFilterOf(result),
      start: result.start ?? null,
      end: result.end ?? null,
      rules: result.rules ?? null,
      stats: result.stats,
      conclusions: result.conclusions,
      trades: result.trades,
      candles,
    };
  }

  return {
    exported_at: exportedAt,
    pair: result.pair,
    strategy: result.strategy ?? "draw_on_liquidity",
    start: result.start ?? null,
    end: result.end ?? null,
    stats: result.stats,
    conclusions: result.conclusions,
    trades: result.series,
    candles,
  };
}

export function buildSweepExportPayload(
  result: Parameters<typeof buildBacktestExportPayload>[0],
  exportedAt: string,
) {
  return buildBacktestExportPayload(result, exportedAt);
}

export function downloadJsonFile(filename: string, payload: unknown): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
