import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LAST_BACKTEST_STORAGE_KEY,
  backtestSetupUrl,
  candleWindowForSetup,
  defaultIntervalForStrategy,
  findSetupInResult,
  saveLastBacktest,
  setupFocusIso,
  type BacktestSetup,
} from "@/lib/backtest-setup";
import type { BacktestDay, BacktestResult, BacktestTrade, TradeBacktestResult } from "@/types/analytics";

const day: BacktestDay = {
  date: "2026-03-12T00:00:00.000Z",
  pdh: 1.1,
  pdl: 1.09,
  open: 1.095,
  high: 1.102,
  low: 1.091,
  close: 1.101,
  outcome: "displaced_up",
  draw: "high",
  bias: "bullish",
  swept_high: true,
  swept_low: false,
  displaced: true,
  draw_hit: true,
};

const trade: BacktestTrade = {
  time: "2026-03-12T09:05:00.000Z",
  side: "bullish",
  entry: 1.1,
  sl: 1.098,
  tp: 1.105,
  exit_time: "2026-03-12T10:20:00.000Z",
  result: "win",
  rr: 2.5,
  sweep_level: 1.097,
};

const dolSetup: BacktestSetup = {
  kind: "draw_on_liquidity",
  pair: "EUR/USD",
  day,
};

const tradeSetup: BacktestSetup = {
  kind: "trade",
  pair: "EUR/USD",
  strategy: "liquidity_sweep",
  trade,
};

describe("defaultIntervalForStrategy", () => {
  it("uses 1h for daily draw-on-liquidity and 5m for trade models", () => {
    expect(defaultIntervalForStrategy("draw_on_liquidity")).toBe("1h");
    expect(defaultIntervalForStrategy("liquidity_sweep")).toBe("5m");
    expect(defaultIntervalForStrategy("pdhl_cisd")).toBe("5m");
  });
});

describe("backtestSetupUrl", () => {
  it("encodes pair, strategy, time, and default interval", () => {
    const url = backtestSetupUrl(tradeSetup);
    expect(url).toContain("/backtest/setup?");
    expect(url).toContain("strategy=liquidity_sweep");
    expect(url).toContain("interval=5m");
    expect(url).toContain(encodeURIComponent("EUR/USD"));
  });
});

describe("candleWindowForSetup", () => {
  it("covers the previous day through the next day for DOL 1h", () => {
    const window = candleWindowForSetup(dolSetup, "1h");
    const start = new Date(window.start).getTime();
    const end = new Date(window.end).getTime();
    const focus = new Date(day.date).getTime();
    expect(start).toBe(focus - 86_400_000);
    expect(end).toBe(focus + 2 * 86_400_000);
    expect(window.limit).toBe(5000);
  });

  it("starts 6h before a trade and ends 4h after exit on 5m", () => {
    const window = candleWindowForSetup(tradeSetup, "5m");
    expect(new Date(window.start).toISOString()).toBe("2026-03-12T03:05:00.000Z");
    expect(new Date(window.end).toISOString()).toBe("2026-03-12T14:20:00.000Z");
  });

  it("widens the window on the daily timeframe", () => {
    const window = candleWindowForSetup(tradeSetup, "1d");
    const start = new Date(window.start).getTime();
    const focus = new Date(trade.time).getTime();
    expect(start).toBe(focus - 14 * 86_400_000);
  });
});

describe("findSetupInResult", () => {
  it("finds a daily row by pair and time", () => {
    const result: BacktestResult = {
      strategy: "draw_on_liquidity",
      pair: "EURUSD",
      count: 1,
      series: [day],
      stats: {
        days: 1,
        sweep_rate: 100,
        displacement_rate: 100,
        reversal_rate: 0,
        inside_rate: 0,
        draw_hit_rate: 100,
        draw_evaluated_days: 1,
        bullish_days: 1,
        bearish_days: 0,
        neutral_days: 0,
        outcome_counts: { displaced_up: 1 },
      },
      conclusions: [],
    };
    const found = findSetupInResult(result, {
      pair: "EUR/USD",
      strategy: "draw_on_liquidity",
      time: day.date,
    });
    expect(found?.kind).toBe("draw_on_liquidity");
    if (found?.kind === "draw_on_liquidity") {
      expect(found.day.outcome).toBe("displaced_up");
    }
  });

  it("finds a trade by entry time", () => {
    const result: TradeBacktestResult = {
      strategy: "liquidity_sweep",
      pair: "EUR/USD",
      count: 1,
      trades: [trade],
      stats: {
        trades: 1,
        wins: 1,
        losses: 0,
        open: 0,
        win_rate: 100,
        avg_r: 2.5,
        expectancy_r: 2.5,
        profit_factor: 2.5,
        bullish: 1,
        bearish: 0,
      },
      conclusions: [],
    };
    const found = findSetupInResult(result, {
      pair: "EURUSD",
      strategy: "liquidity_sweep",
      time: trade.time,
    });
    expect(setupFocusIso(found as BacktestSetup)).toBe(trade.time);
  });
});

describe("saveLastBacktest", () => {
  const store = new Map<string, string>();

  afterEach(() => {
    store.clear();
    vi.unstubAllGlobals();
  });

  function stubStorage(setItem: (key: string, value: string) => void) {
    const sessionStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem,
      removeItem: (key: string) => {
        store.delete(key);
      },
    };
    vi.stubGlobal("window", {});
    vi.stubGlobal("sessionStorage", sessionStorage);
  }

  const sweepResult: TradeBacktestResult = {
    strategy: "liquidity_sweep",
    pair: "XAU/USD",
    count: 1,
    trades: [
      {
        ...trade,
        context: {
          hour_utc: 11,
          weekday: 1,
          bars_into_hour: 2,
          bars_held: 1,
          duration_minutes: 5,
          sweep_depth: 1,
          cisd: { timestamp: trade.time, open: 1.1, high: 1.11, low: 1.09, close: 1.1 },
          cisd_body: 0.01,
          aggressive_ratio: 2,
          mae_r: 0.2,
          mfe_r: 2.6,
          risk: 0.002,
          planned_r: 2.5,
          prev_day: { date: "2026-03-11", open: 1.09, high: 1.1, low: 1.08, close: 1.095 },
          candles_1h: [
            { timestamp: "2026-03-12T08:00:00.000Z", open: 1.1, high: 1.11, low: 1.09, close: 1.1 },
          ],
          candles_5m: [
            { timestamp: "2026-03-12T09:00:00.000Z", open: 1.1, high: 1.11, low: 1.09, close: 1.1 },
          ],
          candles_1h_prev_day: [
            { timestamp: "2026-03-11T12:00:00.000Z", open: 1.09, high: 1.1, low: 1.08, close: 1.095 },
          ],
          candles_5m_prev_day: [
            { timestamp: "2026-03-11T12:00:00.000Z", open: 1.09, high: 1.1, low: 1.08, close: 1.095 },
          ],
        },
      },
    ],
    stats: {
      trades: 1,
      wins: 1,
      losses: 0,
      open: 0,
      win_rate: 100,
      avg_r: 2.5,
      expectancy_r: 2.5,
      profit_factor: 2.5,
      bullish: 1,
      bearish: 0,
    },
    conclusions: [],
  };

  it("omits heavy candle arrays but keeps trade fields", () => {
    stubStorage((key, value) => {
      store.set(key, value);
    });
    saveLastBacktest(
      { pair: "XAU/USD", strategy: "liquidity_sweep" },
      sweepResult,
    );
    const saved = JSON.parse(store.get(LAST_BACKTEST_STORAGE_KEY) ?? "{}") as {
      result: TradeBacktestResult;
    };
    const context = saved.result.trades[0].context;
    expect(context?.candles_5m).toBeUndefined();
    expect(context?.candles_5m_prev_day).toBeUndefined();
    expect(context?.candles_1h_prev_day).toBeUndefined();
    expect(context?.mae_r).toBe(0.2);
    expect(saved.result.trades[0].entry).toBe(trade.entry);
    expect(sweepResult.trades[0].context?.candles_5m).toHaveLength(1);
  });

  it("does not throw when sessionStorage quota is exceeded", () => {
    stubStorage(() => {
      throw new Error("Setting the value exceeded the quota.");
    });
    expect(() =>
      saveLastBacktest({ pair: "XAU/USD", strategy: "liquidity_sweep" }, sweepResult),
    ).not.toThrow();
  });
});
