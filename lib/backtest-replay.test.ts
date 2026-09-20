import { describe, expect, it } from "vitest";
import { nearestBarIndex, replayRange } from "@/lib/backtest-replay";
import {
  computePositionLabels,
  pipSizeForPair,
  pricePrecisionForPair,
} from "@/lib/position-math";
import { candleColorSchemeById } from "@/lib/candle-color-schemes";

const bars = [
  { timestamp: 1_000 },
  { timestamp: 2_000 },
  { timestamp: 3_000 },
  { timestamp: 4_000 },
  { timestamp: 5_000 },
];

describe("nearestBarIndex", () => {
  it("returns the last bar whose open is at or before the timestamp", () => {
    expect(nearestBarIndex(bars, 3_500)).toBe(2);
    expect(nearestBarIndex(bars, 3_000)).toBe(2);
  });

  it("clamps before the first bar and after the last", () => {
    expect(nearestBarIndex(bars, 0)).toBe(0);
    expect(nearestBarIndex(bars, 9_000)).toBe(4);
  });
});

describe("replayRange", () => {
  it("includes context bars before entry and ends on the exit bar", () => {
    const range = replayRange(
      bars,
      { time: new Date(3_000).toISOString(), exit_time: new Date(5_000).toISOString() },
      1,
    );
    expect(range).toEqual({ start: 1, entry: 2, end: 4 });
  });

  it("plays to the last bar when the trade is still open", () => {
    const range = replayRange(bars, { time: new Date(2_000).toISOString(), exit_time: null }, 0);
    expect(range).toEqual({ start: 1, entry: 1, end: 4 });
  });
});

describe("position math", () => {
  it("uses 0.01 pip size for JPY pairs", () => {
    expect(pipSizeForPair("USD/JPY")).toBe(0.01);
    expect(pipSizeForPair("EURUSD")).toBe(0.0001);
    expect(pricePrecisionForPair("USDJPY")).toBe(3);
  });

  it("labels target, stop, and live PnL in pips and R", () => {
    const labels = computePositionLabels(
      "EURUSD",
      { side: "bullish", entry: 1.1, sl: 1.099, tp: 1.1025, rr: 2.5 },
      1.101,
    );
    expect(labels.targetLabel).toContain("25.0 pips");
    expect(labels.targetLabel).toContain("2.5R");
    expect(labels.stopLabel).toContain("10.0 pips");
    expect(labels.centerLabel).toMatch(/PnL: \+10\.0 pips/);
    expect(labels.pnlPositive).toBe(true);
    expect(labels.showTarget).toBe(true);
    expect(labels.showStop).toBe(true);
    expect(labels.showCenter).toBe(true);
  });

  it("marks losing last-close PnL red and honors label visibility", () => {
    const labels = computePositionLabels(
      "EURUSD",
      { side: "bullish", entry: 1.1, sl: 1.099, tp: 1.1025, rr: 2.5 },
      1.0995,
      { target: false, stop: true, center: false },
    );
    expect(labels.pnlPositive).toBe(false);
    expect(labels.showTarget).toBe(false);
    expect(labels.showStop).toBe(true);
    expect(labels.showCenter).toBe(false);
  });
});

describe("candleColorSchemeById", () => {
  it("falls back to green/red", () => {
    expect(candleColorSchemeById("nope").id).toBe("green_red");
    expect(candleColorSchemeById("teal_red").up).toBe("#26a69a");
  });
});
