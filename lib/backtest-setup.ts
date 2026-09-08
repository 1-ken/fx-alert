import { DISPLAY_TIMEZONE } from "@/lib/datetime";
import {
  CHART_INTERVAL_OPTIONS,
  chartIntervalToSeconds,
  type ChartInterval,
} from "@/lib/chart-utils";
import type {
  AnyBacktestResult,
  BacktestDay,
  BacktestStrategy,
  BacktestTrade,
  TradeBacktestResult,
} from "@/types/analytics";
import { isTradeBacktest } from "@/types/analytics";

export type CachedBacktestParams = {
  pair: string;
  strategy: BacktestStrategy;
  start?: string;
  end?: string;
};

export const BACKTEST_SETUP_STORAGE_KEY = "fx-alert:backtest-setup";
export const LAST_BACKTEST_STORAGE_KEY = "fx-alert:backtest-last-result";
export const DISPLAY_CHART_TIMEZONE = DISPLAY_TIMEZONE;

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const MAX_BARS = 5000;

export const STRATEGY_LABELS: Record<BacktestStrategy, string> = {
  draw_on_liquidity: "Draw on liquidity",
  liquidity_sweep: "Liquidity sweep",
  pdhl_cisd: "PDH/PDL CISD",
};

export type DrawOnLiquiditySetup = {
  kind: "draw_on_liquidity";
  pair: string;
  day: BacktestDay;
};

export type TradeSetup = {
  kind: "trade";
  pair: string;
  strategy: TradeBacktestResult["strategy"];
  trade: BacktestTrade;
};

export type BacktestSetup = DrawOnLiquiditySetup | TradeSetup;

export type LastBacktestCache = {
  params: CachedBacktestParams;
  result: AnyBacktestResult;
};

export type BacktestSetupQuery = {
  pair?: string | null;
  strategy?: string | null;
  time?: string | null;
  interval?: string | null;
};

function canUseSessionStorage(): boolean {
  return typeof window !== "undefined" && typeof sessionStorage !== "undefined";
}

function parseJson<T>(raw: string | null): T | null {
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function isChartInterval(value: string | null | undefined): value is ChartInterval {
  return (
    typeof value === "string" &&
    (CHART_INTERVAL_OPTIONS as readonly string[]).includes(value)
  );
}

export function defaultIntervalForStrategy(strategy: BacktestStrategy): ChartInterval {
  return strategy === "draw_on_liquidity" ? "1h" : "5m";
}

export function setupFocusIso(setup: BacktestSetup): string {
  return setup.kind === "draw_on_liquidity" ? setup.day.date : setup.trade.time;
}

export function setupFocusTimestamp(setup: BacktestSetup): number {
  return new Date(setupFocusIso(setup)).getTime();
}

export function setupStrategy(setup: BacktestSetup): BacktestStrategy {
  return setup.kind === "draw_on_liquidity" ? "draw_on_liquidity" : setup.strategy;
}

export function saveBacktestSetup(setup: BacktestSetup): void {
  if (!canUseSessionStorage()) {
    return;
  }
  sessionStorage.setItem(BACKTEST_SETUP_STORAGE_KEY, JSON.stringify(setup));
}

export function loadBacktestSetup(): BacktestSetup | null {
  if (!canUseSessionStorage()) {
    return null;
  }
  return parseJson<BacktestSetup>(sessionStorage.getItem(BACKTEST_SETUP_STORAGE_KEY));
}

export function saveLastBacktest(
  params: CachedBacktestParams,
  result: AnyBacktestResult,
): void {
  if (!canUseSessionStorage()) {
    return;
  }
  const payload: LastBacktestCache = { params, result };
  sessionStorage.setItem(LAST_BACKTEST_STORAGE_KEY, JSON.stringify(payload));
}

export function loadLastBacktest(): LastBacktestCache | null {
  if (!canUseSessionStorage()) {
    return null;
  }
  return parseJson<LastBacktestCache>(sessionStorage.getItem(LAST_BACKTEST_STORAGE_KEY));
}

export function backtestSetupUrl(
  setup: BacktestSetup,
  interval?: ChartInterval,
): string {
  const params = new URLSearchParams({
    pair: setup.pair,
    strategy: setupStrategy(setup),
    time: setupFocusIso(setup),
    interval: interval ?? defaultIntervalForStrategy(setupStrategy(setup)),
  });
  return `/backtest/setup?${params.toString()}`;
}

function compactPair(pair: string): string {
  return pair.replace(/[^a-z0-9]/gi, "").toUpperCase();
}

function samePair(a: string, b: string): boolean {
  return compactPair(a) === compactPair(b);
}

function sameTime(a: string, b: string): boolean {
  const left = new Date(a).getTime();
  const right = new Date(b).getTime();
  if (Number.isFinite(left) && Number.isFinite(right)) {
    return left === right;
  }
  return a.slice(0, 10) === b.slice(0, 10);
}

function setupMatchesQuery(setup: BacktestSetup, query: BacktestSetupQuery): boolean {
  if (query.pair && !samePair(setup.pair, query.pair)) {
    return false;
  }
  if (query.strategy && setupStrategy(setup) !== query.strategy) {
    return false;
  }
  if (query.time && !sameTime(setupFocusIso(setup), query.time)) {
    return false;
  }
  return true;
}

export function findSetupInResult(
  result: AnyBacktestResult,
  query: BacktestSetupQuery,
): BacktestSetup | null {
  if (!query.pair || !query.time || !samePair(result.pair, query.pair)) {
    return null;
  }
  if (isTradeBacktest(result)) {
    if (query.strategy && result.strategy !== query.strategy) {
      return null;
    }
    const trade = result.trades.find((item) => sameTime(item.time, query.time ?? ""));
    if (!trade) {
      return null;
    }
    return {
      kind: "trade",
      pair: result.pair,
      strategy: result.strategy,
      trade,
    };
  }
  if (query.strategy && query.strategy !== "draw_on_liquidity") {
    return null;
  }
  const day = result.series.find((item) => sameTime(item.date, query.time ?? ""));
  if (!day) {
    return null;
  }
  return {
    kind: "draw_on_liquidity",
    pair: result.pair,
    day,
  };
}

export function resolveBacktestSetup(query: BacktestSetupQuery): BacktestSetup | null {
  const stored = loadBacktestSetup();
  if (stored && setupMatchesQuery(stored, query)) {
    return stored;
  }
  const last = loadLastBacktest();
  if (last) {
    const fromResult = findSetupInResult(last.result, query);
    if (fromResult) {
      return fromResult;
    }
  }
  return stored;
}

export function candleWindowForSetup(
  setup: BacktestSetup,
  interval: ChartInterval,
): { start: string; end: string; limit: number } {
  const intervalMs = chartIntervalToSeconds(interval) * 1000;
  const focusMs = setupFocusTimestamp(setup);
  let startMs: number;
  let endMs: number;

  if (setup.kind === "draw_on_liquidity") {
    startMs = focusMs - DAY_MS;
    endMs = focusMs + 2 * DAY_MS;
    if (interval === "4h") {
      startMs = focusMs - 7 * DAY_MS;
      endMs = focusMs + 4 * DAY_MS;
    } else if (interval === "1d") {
      startMs = focusMs - 14 * DAY_MS;
      endMs = focusMs + 7 * DAY_MS;
    }
  } else {
    const exitMs = setup.trade.exit_time
      ? new Date(setup.trade.exit_time).getTime()
      : focusMs + 8 * HOUR_MS;
    startMs = focusMs - 6 * HOUR_MS;
    endMs = (Number.isFinite(exitMs) ? exitMs : focusMs) + 4 * HOUR_MS;
    if (interval === "1h") {
      startMs = focusMs - 2 * DAY_MS;
      endMs = Math.max(endMs, focusMs) + DAY_MS;
    } else if (interval === "4h") {
      startMs = focusMs - 7 * DAY_MS;
      endMs = Math.max(endMs, focusMs) + 3 * DAY_MS;
    } else if (interval === "1d") {
      startMs = focusMs - 14 * DAY_MS;
      endMs = Math.max(endMs, focusMs) + 7 * DAY_MS;
    }
  }

  const span = endMs - startMs;
  const bars = span / intervalMs;
  if (bars > MAX_BARS) {
    const half = (MAX_BARS * intervalMs) / 2;
    startMs = focusMs - half;
    endMs = focusMs + half;
  }

  return {
    start: new Date(startMs).toISOString(),
    end: new Date(endMs).toISOString(),
    limit: MAX_BARS,
  };
}
