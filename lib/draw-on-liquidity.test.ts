import { describe, expect, it } from "vitest";
import {
  classifyDay,
  computeBiasSeries,
  computeLiveBias,
} from "@/lib/draw-on-liquidity";
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
      candle("2024-01-01", 100, 110, 90, 105), // base day (no prior)
      candle("2024-01-02", 105, 115, 104, 113), // displaced_up vs day1 -> draw high
      candle("2024-01-03", 113, 120, 112, 116), // vs day2 (PDH 115): high>=115 -> drawHit true
    ];
    const series = computeBiasSeries(candles);
    expect(series).toHaveLength(2);

    expect(series[0].outcome).toBe("displaced_up");
    expect(series[0].draw).toBe("high");
    expect(series[0].drawHit).toBeNull(); // no prior bias entry

    // day3 reached the PDH (115) that day2's "high" draw pointed to
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
    candle("2024-01-02", 105, 115, 104, 113), // last completed day -> displaced_up -> draw high
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
  });

  it("flags sweep + displacement once live price crosses PDH", () => {
    const live = computeLiveBias(closed, null, 117);
    expect(live?.sweptHigh).toBe(true);
    expect(live?.displacedUp).toBe(true);
    expect(live?.drawReached).toBe(true);
  });

  it("returns null without closed daily candles", () => {
    expect(computeLiveBias([], null, 100)).toBeNull();
  });
});
