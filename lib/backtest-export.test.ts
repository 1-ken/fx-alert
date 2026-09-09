import { describe, expect, it } from "vitest";
import {
  buildBacktestExportPayload,
  buildSweepExportPayload,
  sweepExportFilename,
} from "@/lib/backtest-export";
import type { TradeBacktestResult } from "@/types/analytics";

const result: TradeBacktestResult = {
  strategy: "liquidity_sweep",
  pair: "EUR/USD",
  count: 1,
  start: "2026-06-01T00:00:00.000Z",
  end: "2026-09-08T00:00:00.000Z",
  rules: {
    reward_r: 2.5,
    entry: "aggressive_5m_cisd_close",
    stop: "swept_1h_extreme",
    sweep_window: "next_hour_only",
    aggressive_body_mult: 1.5,
    aggressive_lookback: 12,
  },
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
  conclusions: ["Liquidity sweep found 1 setup on EUR/USD."],
  trades: [
    {
      time: "2026-06-02T11:10:00.000Z",
      side: "bullish",
      entry: 1.1,
      sl: 1.098,
      tp: 1.105,
      exit_time: "2026-06-02T11:15:00.000Z",
      result: "win",
      rr: 2.5,
      sweep_level: 1.097,
      sweep_time: "2026-06-02T10:00:00.000Z",
      context: {
        hour_utc: 11,
        weekday: 1,
        bars_into_hour: 2,
        bars_held: 1,
        duration_minutes: 5,
        sweep_depth: 0.002,
        cisd: {
          timestamp: "2026-06-02T11:10:00.000Z",
          open: 1.099,
          high: 1.1038,
          low: 1.0988,
          close: 1.1,
        },
        cisd_body: 0.001,
        aggressive_ratio: 2,
        mae_r: 0.2,
        mfe_r: 2.6,
        risk: 0.002,
        planned_r: 2.5,
        prev_day: {
          date: "2026-06-01",
          open: 1.09,
          high: 1.1,
          low: 1.088,
          close: 1.095,
        },
        candles_1h: [
          {
            timestamp: "2026-06-02T10:00:00.000Z",
            open: 1.105,
            high: 1.106,
            low: 1.097,
            close: 1.104,
          },
        ],
        candles_5m: [
          {
            timestamp: "2026-06-02T11:10:00.000Z",
            open: 1.099,
            high: 1.1038,
            low: 1.0988,
            close: 1.1,
          },
        ],
        candles_1h_prev_day: [
          {
            timestamp: "2026-06-01T12:00:00.000Z",
            open: 1.09,
            high: 1.091,
            low: 1.089,
            close: 1.09,
          },
        ],
        candles_5m_prev_day: [],
      },
    },
  ],
};

describe("sweepExportFilename", () => {
  it("uses compact pair and date range", () => {
    expect(
      sweepExportFilename("EUR/USD", "2026-06-01T00:00:00.000Z", "2026-09-08T00:00:00.000Z"),
    ).toBe("liquidity-sweep-EURUSD-2026-06-01-2026-09-08.json");
  });

  it("falls back when the range is missing", () => {
    expect(sweepExportFilename("GBPUSD")).toBe("liquidity-sweep-GBPUSD-all-all.json");
  });
});

describe("buildSweepExportPayload", () => {
  it("includes trades, stats, rules, and per-trade candles", () => {
    const payload = buildSweepExportPayload(result, "2026-09-08T12:00:00.000Z");
    expect(payload.exported_at).toBe("2026-09-08T12:00:00.000Z");
    expect(payload.strategy).toBe("liquidity_sweep");
    expect(payload.rules?.reward_r).toBe(2.5);
    expect(payload.stats.trades).toBe(1);
    expect(payload.trades).toHaveLength(1);
    expect(payload.trades[0].context?.candles_1h).toHaveLength(1);
    expect(payload.trades[0].context?.candles_5m?.length).toBeGreaterThan(0);
    expect(payload.candles.length).toBeGreaterThan(0);
    expect(payload.trades[0].context?.candles_1h_prev_day).toHaveLength(1);
    expect(payload.candles.some((bar) => bar.timestamp === "2026-06-02T11:10:00.000Z")).toBe(
      true,
    );
    expect(payload.trades[0].context?.prev_day.date).toBe("2026-06-01");
  });
});

describe("buildBacktestExportPayload", () => {
  it("keeps PDH/PDL rules and copies take and CISD bars into candles", () => {
    const pdhl: TradeBacktestResult = {
      strategy: "pdhl_cisd",
      pair: "XAUUSD",
      count: 1,
      side_filter: "all",
      start: "2026-09-08T00:00:00.000Z",
      end: "2026-09-08T23:59:59.999Z",
      rules: {
        strict_trade_through: true,
        side_filter: "all",
        sequence: "1h_trade_through_then_1h_cisd_then_5m_cisd",
        reward_r: 2,
      },
      stats: result.stats,
      conclusions: ["PDH/PDL CISD continuation found 1 setup on XAUUSD."],
      trades: [
        {
          time: "2026-09-08T15:10:00.000Z",
          side: "bearish",
          entry: 4440,
          sl: 4450,
          tp: 4420,
          exit_time: "2026-09-08T15:20:00.000Z",
          result: "win",
          rr: 2,
          sweep_level: 4430,
          sweep_time: "2026-09-08T13:00:00.000Z",
          context: {
            hour_utc: 15,
            weekday: 1,
            bars_into_hour: 2,
            bars_held: 2,
            duration_minutes: 10,
            sweep_depth: 4,
            cisd: {
              timestamp: "2026-09-08T15:10:00.000Z",
              open: 4448,
              high: 4451,
              low: 4438,
              close: 4440,
            },
            cisd_1h: {
              timestamp: "2026-09-08T14:00:00.000Z",
              open: 4455,
              high: 4458,
              low: 4436,
              close: 4438,
            },
            take: {
              timestamp: "2026-09-08T13:00:00.000Z",
              open: 4428,
              high: 4436,
              low: 4424,
              close: 4432,
              took: "pdh",
            },
            cisd_body: 8,
            aggressive_ratio: null,
            mae_r: 0.2,
            mfe_r: 2.1,
            risk: 10,
            planned_r: 2,
            prev_day: {
              date: "2026-09-07",
              open: null,
              high: 4430,
              low: 4400,
              close: null,
            },
            candles_1h: [],
            candles_5m: [],
            candles_1h_prev_day: [],
          },
        },
      ],
    };

    const payload = buildBacktestExportPayload(pdhl, "2026-09-09T06:00:00.000Z");
    expect(payload.rules).not.toBeNull();
    expect(payload.side_filter).toBe("all");
    expect(payload.candles.length).toBeGreaterThan(0);
    expect(payload.candles.map((bar) => bar.timestamp)).toEqual([
      "2026-09-08T13:00:00.000Z",
      "2026-09-08T14:00:00.000Z",
      "2026-09-08T15:10:00.000Z",
    ]);
  });
});
