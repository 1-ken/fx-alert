import { describe, expect, it, vi, afterEach } from "vitest";
import {
  buildPairPredictionRecords,
  buildPendingRecord,
  buildTodayPredictionRecord,
  buildTodayScorecard,
  dayBiasToPredictionRecord,
  summarizePredictions,
  todayTradingDayKey,
} from "@/lib/prediction-scorecard";
import { normalizeClosedDailyCandles } from "@/lib/daily-trading-day";
import type { DayBias, LiveBias, LiveBiasDetails } from "@/lib/draw-on-liquidity";
import type { OhlcCandle } from "@/types/historical";

function dayBias(overrides: Partial<DayBias> & Pick<DayBias, "date">): DayBias {
  return {
    pdh: 110,
    pdl: 90,
    open: 100,
    high: 105,
    low: 95,
    close: 102,
    outcome: "inside",
    draw: "none",
    bias: "neutral",
    sweptHigh: false,
    sweptLow: false,
    displaced: false,
    drawHit: null,
    ...overrides,
  };
}

function candle(date: string, o: number, h: number, l: number, c: number): OhlcCandle {
  return {
    timestamp: `${date}T00:00:00Z`,
    open: o,
    high: h,
    low: l,
    close: c,
    volume: 1,
  };
}

describe("dayBiasToPredictionRecord", () => {
  it("maps drawHit true to hit", () => {
    const prior = dayBias({
      date: "2024-01-01T00:00:00Z",
      draw: "high",
      bias: "bullish",
    });
    const day = dayBias({
      date: "2024-01-02T00:00:00Z",
      drawHit: true,
      pdh: 115,
      pdl: 104,
    });
    const row = dayBiasToPredictionRecord("EURUSD", day, prior);
    expect(row.status).toBe("hit");
    expect(row.predictedDraw).toBe("high");
    expect(row.tradingDay).toBe("2024-01-02");
    expect(row.setByDay).toBe("2024-01-01");
    expect(row.drawTargetPrice).toBe(115);
  });

  it("maps drawHit false to miss", () => {
    const prior = dayBias({
      date: "2024-01-01T00:00:00Z",
      draw: "low",
      bias: "bearish",
    });
    const day = dayBias({
      date: "2024-01-02T00:00:00Z",
      drawHit: false,
      pdl: 88,
    });
    expect(dayBiasToPredictionRecord("EURUSD", day, prior).status).toBe("miss");
  });

  it("maps drawHit null to none", () => {
    const prior = dayBias({ date: "2024-01-01T00:00:00Z", draw: "none" });
    const day = dayBias({ date: "2024-01-02T00:00:00Z", drawHit: null });
    expect(dayBiasToPredictionRecord("EURUSD", day, prior).status).toBe("none");
  });
});

describe("buildPendingRecord", () => {
  it("returns pending when draw is active and not reached", () => {
    const live: LiveBias = {
      pdh: 1.1,
      pdl: 1.0,
      bias: "bullish",
      draw: "high",
      drawTargetPrice: 1.1,
      sweptHigh: false,
      sweptLow: false,
      displacedUp: false,
      displacedDown: false,
      drawReached: false,
      hasIntradayData: true,
    };
    const details: LiveBiasDetails = {
      pdhReferenceDate: "2024-01-01",
      pdhReference: { open: 1, high: 1.1, low: 0.99, close: 1.05 },
      classifiedDate: "2024-01-01",
      classified: {
        open: 1,
        high: 1.1,
        low: 0.99,
        close: 1.05,
        outcome: "displaced_up",
      },
      todayForming: {
        timestamp: "2024-01-02T00:00:00Z",
        open: 1.05,
        high: 1.06,
        low: 1.04,
        close: 1.055,
      },
    };
    const row = buildPendingRecord("EURUSD", live, details);
    expect(row?.status).toBe("pending");
    expect(row?.tradingDay).toBe("2024-01-02");
    expect(row?.setByDay).toBe("2024-01-01");
  });

  it("returns hit when draw already reached today", () => {
    const live: LiveBias = {
      pdh: 1.1,
      pdl: 1.0,
      bias: "bullish",
      draw: "high",
      drawTargetPrice: 1.1,
      sweptHigh: true,
      sweptLow: false,
      displacedUp: true,
      displacedDown: false,
      drawReached: true,
      hasIntradayData: true,
    };
    expect(buildPendingRecord("EURUSD", live, null)?.status).toBe("hit");
  });
});

describe("buildTodayPredictionRecord", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns pending when draw is active and not reached", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-02T12:00:00Z"));

    const closed = [
      candle("2023-12-31", 95, 100, 94, 98),
      candle("2024-01-01", 98, 110, 96, 106),
    ];
    const today = {
      ...candle("2024-01-02", 106, 107, 105, 106.5),
      is_forming: true,
    };

    const row = buildTodayPredictionRecord("EURUSD", closed, today);
    expect(row.tradingDay).toBe(todayTradingDayKey());
    expect(row.status).toBe("pending");
    expect(row.predictedDraw).toBe("high");
  });

  it("returns hit when draw already reached today", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-02T12:00:00Z"));

    const closed = [
      candle("2024-01-01", 100, 110, 90, 105),
      candle("2024-01-02", 105, 115, 104, 113),
    ];
    const today = {
      ...candle("2024-01-02", 105, 115, 104, 113),
      is_forming: true,
    };

    const row = buildTodayPredictionRecord("EURUSD", closed, today);
    expect(row.tradingDay).toBe(todayTradingDayKey());
    expect(row.status).toBe("hit");
  });

  it("returns none when draw is neutral today", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-02T12:00:00Z"));

    const closed = [
      candle("2024-01-01", 100, 110, 90, 105),
      candle("2024-01-02", 105, 108, 102, 106),
    ];
    const today = {
      ...candle("2024-01-02", 105, 108, 102, 106),
      is_forming: true,
    };

    const row = buildTodayPredictionRecord("EURUSD", closed, today);
    expect(row.tradingDay).toBe(todayTradingDayKey());
    expect(row.status).toBe("none");
    expect(row.predictedDraw).toBe("none");
  });

  it("returns none with neutral bias when no candle data", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-02T12:00:00Z"));

    const row = buildTodayPredictionRecord("EURUSD", [], null);
    expect(row.tradingDay).toBe("2024-01-02");
    expect(row.status).toBe("none");
    expect(row.predictedBias).toBe("neutral");
  });
});

describe("buildTodayScorecard", () => {
  it("merges one row per pair with days set to 1", () => {
    const scorecard = buildTodayScorecard([
      {
        pair: "EURUSD",
        tradingDay: "2024-01-02",
        predictedBias: "bullish",
        predictedDraw: "high",
        drawTargetPrice: 1.1,
        status: "pending",
        setByDay: "2024-01-01",
      },
      {
        pair: "GBPUSD",
        tradingDay: "2024-01-02",
        predictedBias: "neutral",
        predictedDraw: "none",
        drawTargetPrice: null,
        status: "none",
        setByDay: "2024-01-01",
      },
    ]);
    expect(scorecard.days).toBe(1);
    expect(scorecard.records).toHaveLength(2);
    expect(scorecard.summary.pending).toBe(1);
    expect(scorecard.summary.none).toBe(1);
  });
});

describe("buildPairPredictionRecords", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("aligns with computeBiasSeries drawHit for historical days", () => {
    const closed = [
      candle("2024-01-01", 100, 110, 90, 105),
      candle("2024-01-02", 105, 115, 104, 113),
      candle("2024-01-03", 113, 120, 112, 116),
    ];
    const records = buildPairPredictionRecords("EURUSD", closed, null, undefined, 30);
    const hitRow = records.find((r) => r.tradingDay === "2024-01-03");
    expect(hitRow?.status).toBe("hit");
    expect(hitRow?.predictedDraw).toBe("high");
  });

  it("uses Friday as set-by day on Monday after evening-open normalization", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-22T10:00:00Z"));

    const closed = normalizeClosedDailyCandles([
      {
        timestamp: "2026-06-16T00:00:00Z",
        open: 99,
        high: 107,
        low: 98,
        close: 104,
        volume: 1,
      },
      {
        timestamp: "2026-06-17T00:00:00Z",
        open: 100,
        high: 108,
        low: 99,
        close: 105,
        volume: 1,
      },
      {
        timestamp: "2026-06-18T22:00:00Z",
        open: 105,
        high: 115,
        low: 104,
        close: 113,
        volume: 1,
      },
    ]);

    const records = buildPairPredictionRecords("EURUSD", closed, null, undefined, 30);
    const friday = records.find((r) => r.tradingDay === "2026-06-19");
    expect(friday).toBeDefined();
    expect(friday?.setByDay).toBe("2026-06-17");
  });
});

describe("summarizePredictions", () => {
  it("computes hit rate from hit and miss only", () => {
    const summary = summarizePredictions([
      {
        pair: "EURUSD",
        tradingDay: "2024-01-02",
        predictedBias: "bullish",
        predictedDraw: "high",
        drawTargetPrice: 1.1,
        status: "hit",
        setByDay: "2024-01-01",
      },
      {
        pair: "EURUSD",
        tradingDay: "2024-01-03",
        predictedBias: "bearish",
        predictedDraw: "low",
        drawTargetPrice: 1.0,
        status: "miss",
        setByDay: "2024-01-02",
      },
      {
        pair: "GBPUSD",
        tradingDay: "2024-01-02",
        predictedBias: "neutral",
        predictedDraw: "none",
        drawTargetPrice: null,
        status: "pending",
        setByDay: "2024-01-01",
      },
    ]);
    expect(summary.hit).toBe(1);
    expect(summary.miss).toBe(1);
    expect(summary.pending).toBe(1);
    expect(summary.hit_rate).toBe(50);
    expect(summary.evaluated_days).toBe(2);
  });
});
