import { describe, expect, it, vi, afterEach } from "vitest";
import {
  classifyDay,
  computeBiasSeries,
  computeLiveBias,
  computeLiveBiasDetails,
} from "@/lib/draw-on-liquidity";
import {
  isTodayTradingDayCandle,
  normalizeClosedDailyCandles,
  normalizeFormingDailyCandle,
  todayTradingDayStartMs,
} from "@/lib/daily-trading-day";
import type { OhlcCandle } from "@/types/historical";

function candle(
  date: string,
  open: number,
  high: number,
  low: number,
  close: number,
  isForming = false,
): OhlcCandle {
  return {
    timestamp: `${date}T00:00:00Z`,
    open,
    high,
    low,
    close,
    volume: 1,
    is_forming: isForming,
  };
}

function todayCandle(
  open: number,
  high: number,
  low: number,
  close: number,
  isForming = true,
): OhlcCandle {
  const todayMs = todayTradingDayStartMs();
  return {
    timestamp: new Date(todayMs).toISOString(),
    open,
    high,
    low,
    close,
    volume: 1,
    is_forming: isForming,
  };
}

describe("classifyDay", () => {
  // PDH = 110, PDL = 90
  it("displaced_up when close > PDH", () => {
    expect(classifyDay(110, 90, { high: 115, low: 100, close: 113 })).toEqual({
      outcome: "displaced_up",
      draw: "high",
      bias: "bullish",
    });
  });

  it("displaced_down when close < PDL", () => {
    expect(classifyDay(110, 90, { high: 100, low: 85, close: 87 })).toEqual({
      outcome: "displaced_down",
      draw: "low",
      bias: "bearish",
    });
  });

  it("reversal_from_high when swept PDH but closed back inside", () => {
    expect(classifyDay(110, 90, { high: 112, low: 100, close: 105 })).toEqual({
      outcome: "reversal_from_high",
      draw: "low",
      bias: "bearish",
    });
  });

  it("reversal_from_low when swept PDL but closed back inside", () => {
    expect(classifyDay(110, 90, { high: 105, low: 88, close: 99 })).toEqual({
      outcome: "reversal_from_low",
      draw: "high",
      bias: "bullish",
    });
  });

  it("swept_both when both swept but closed inside", () => {
    expect(classifyDay(110, 90, { high: 112, low: 88, close: 100 })).toEqual({
      outcome: "swept_both",
      draw: "none",
      bias: "neutral",
    });
  });

  it("inside when no sweep", () => {
    expect(classifyDay(110, 90, { high: 108, low: 92, close: 100 })).toEqual({
      outcome: "inside",
      draw: "none",
      bias: "neutral",
    });
  });
});

describe("computeBiasSeries", () => {
  it("classifies each day vs the prior day and tracks drawHit", () => {
    const candles = [
      candle("2024-01-01", 100, 110, 90, 105),
      candle("2024-01-02", 105, 115, 104, 113),
      candle("2024-01-03", 113, 120, 112, 116),
    ];
    const series = computeBiasSeries(candles);
    expect(series).toHaveLength(2);

    expect(series[0].outcome).toBe("displaced_up");
    expect(series[0].draw).toBe("high");
    expect(series[0].drawHit).toBeNull();

    expect(series[1].pdh).toBe(115);
    expect(series[1].drawHit).toBe(true);
  });

  it("ignores forming candles", () => {
    const candles = [
      candle("2024-01-01", 100, 110, 90, 105),
      candle("2024-01-02", 105, 115, 104, 113),
      candle("2024-01-03", 113, 120, 112, 116, true),
    ];
    expect(computeBiasSeries(candles)).toHaveLength(1);
  });
});

describe("computeLiveBias", () => {
  const closed = [
    candle("2024-01-01", 100, 110, 90, 105),
    candle("2024-01-02", 105, 115, 104, 113),
  ];

  it("derives bias/draw from the last completed day and PDH/PDL from its range", () => {
    const live = computeLiveBias(closed, null, 114);
    expect(live).not.toBeNull();
    expect(live?.pdh).toBe(115);
    expect(live?.pdl).toBe(104);
    expect(live?.bias).toBe("bullish");
    expect(live?.draw).toBe("high");
    expect(live?.drawTargetPrice).toBe(115);
    expect(live?.drawReached).toBe(false);
    expect(live?.hasIntradayData).toBe(false);
  });

  it("does not mark draw reached from live price alone without today's forming bar", () => {
    const live = computeLiveBias(closed, null, 117);
    expect(live?.sweptHigh).toBe(false);
    expect(live?.drawReached).toBe(false);
    expect(live?.displacedUp).toBe(true);
    expect(live?.hasIntradayData).toBe(false);
  });

  it("flags sweep + draw reached when today's forming bar crosses PDH", () => {
    const forming = todayCandle(113, 117, 112, 116);
    const live = computeLiveBias(closed, forming, 116);
    expect(live?.sweptHigh).toBe(true);
    expect(live?.drawReached).toBe(true);
    expect(live?.hasIntradayData).toBe(true);
  });

  it("does not treat stale forming timestamps as today's intraday data", () => {
    const staleForming = candle("2024-01-01", 113, 117, 112, 116, true);
    const live = computeLiveBias(closed, staleForming, 117);
    expect(live?.sweptHigh).toBe(false);
    expect(live?.drawReached).toBe(false);
  });

  it("returns null without closed daily candles", () => {
    expect(computeLiveBias([], null, 100)).toBeNull();
  });
});

describe("reported pair scenarios (synthetic UTC daily candles)", () => {
  it("NZUSD: PDL swept with close inside -> bullish reversal (not bearish)", () => {
    const prev = candle("2024-06-17", 0.6120, 0.6145, 0.6110, 0.6130);
    const day = candle("2024-06-18", 0.6130, 0.6135, 0.6105, 0.6125);
    const cls = classifyDay(prev.high, prev.low, day);
    expect(cls.outcome).toBe("reversal_from_low");
    expect(cls.bias).toBe("bullish");
    expect(cls.draw).toBe("high");
  });

  it("AUDUSD: both levels swept with close inside -> range/neutral", () => {
    const prev = candle("2024-06-17", 0.6650, 0.6680, 0.6620, 0.6655);
    const day = candle("2024-06-18", 0.6655, 0.6685, 0.6615, 0.6660);
    const cls = classifyDay(prev.high, prev.low, day);
    expect(cls.outcome).toBe("swept_both");
    expect(cls.bias).toBe("neutral");
    expect(cls.draw).toBe("none");
  });

  it("AUDUSD: both swept but close above PDH -> bullish (not range)", () => {
    const prev = candle("2024-06-17", 0.6650, 0.6680, 0.6620, 0.6655);
    const day = candle("2024-06-18", 0.6655, 0.6690, 0.6610, 0.6685);
    const cls = classifyDay(prev.high, prev.low, day);
    expect(cls.outcome).toBe("displaced_up");
    expect(cls.bias).toBe("bullish");
  });

  it("CADJPY: contaminated forming high must not alone mark draw reached", () => {
    const closedBars = [
      candle("2024-06-17", 110.0, 112.5, 109.5, 111.0),
      candle("2024-06-18", 111.0, 112.5, 110.8, 112.0),
    ];
    const contaminated = todayCandle(112.0, 112.5, 110.8, 111.5);
    const clean = todayCandle(112.0, 111.8, 110.9, 111.5);
    expect(computeLiveBias(closedBars, contaminated, 111.5)?.drawReached).toBe(true);
    expect(computeLiveBias(closedBars, clean, 111.5)?.drawReached).toBe(false);
  });
});

describe("Monday mis-timestamped Friday bar", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses Friday as classified day after trading-day normalization", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-22T10:00:00Z"));

    const closed = normalizeClosedDailyCandles([
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

    const details = computeLiveBiasDetails(closed, null);
    expect(details?.classifiedDate).toBe("2026-06-19");
    expect(details?.classifiedDate).not.toBe("2026-06-18");
    expect(details?.classified.high).toBe(115);
  });
});

describe("computeLiveBiasDetails", () => {
  it("returns reference and classified day metadata", () => {
    const closed = [
      candle("2024-01-01", 100, 110, 90, 105),
      candle("2024-01-02", 105, 115, 104, 113),
    ];
    const details = computeLiveBiasDetails(closed, null);
    expect(details?.pdhReferenceDate).toBe("2024-01-02");
    expect(details?.classifiedDate).toBe("2024-01-02");
    expect(details?.classified.outcome).toBe("displaced_up");
    expect(details?.todayForming).toBeNull();
  });
});

describe("isTodayTradingDayCandle", () => {
  it("matches today's normalized trading day", () => {
    const today = todayCandle(1, 2, 0.5, 1.5);
    expect(isTodayTradingDayCandle(today)).toBe(true);
    expect(isTodayTradingDayCandle(candle("2020-01-01", 1, 2, 0.5, 1.5, true))).toBe(
      false,
    );
  });

  it("accepts Sunday-evening opens mapped to Monday", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-22T12:00:00Z"));
    const forming = normalizeFormingDailyCandle(
      candle("2026-06-21", 1, 2, 0.5, 1.5, true),
    );
    forming.timestamp = "2026-06-21T22:00:00Z";
    const normalized = normalizeFormingDailyCandle(forming);
    expect(isTodayTradingDayCandle(normalized)).toBe(true);
    vi.useRealTimers();
  });
});
