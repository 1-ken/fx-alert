import { describe, expect, it } from "vitest";
import type { OhlcCandle, OhlcWithFormingResponse } from "@/types/historical";
import {
  applyLivePriceToForming,
  buildChartCandles,
  canUpdateSeriesLastBar,
  candleToSeriesPoint,
  chartTimeToUnix,
  defaultVisibleRange,
  mergeFormingCandle,
  pickClosedBase,
  priceRangeFromCandles,
  resolveClosedCandles,
  seriesDataWithLiveForming,
  toChartTime,
} from "./chart-utils";

function candle(ts: string, close: number, isForming = false): OhlcCandle {
  return {
    timestamp: ts,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1,
    is_forming: isForming,
  };
}

describe("resolveClosedCandles", () => {
  it("uses non-forming candles from response", () => {
    const data: OhlcWithFormingResponse = {
      pair: "EUR/USD",
      interval: "5m",
      start: null,
      end: null,
      count: 2,
      candles: [candle("2024-01-01T10:00:00Z", 1.1), candle("2024-01-01T10:05:00Z", 1.2)],
    };
    expect(resolveClosedCandles(data)).toHaveLength(2);
  });

  it("falls back to cached closed when API returns empty with forming", () => {
    const cached = [candle("2024-01-01T10:00:00Z", 1.1)];
    const data: OhlcWithFormingResponse = {
      pair: "EUR/USD",
      interval: "5m",
      start: null,
      end: null,
      count: 0,
      candles: [],
      has_forming_candle: true,
    };
    expect(resolveClosedCandles(data, cached)).toEqual(cached);
  });

  it("drops last raw candle when all rows are marked forming", () => {
    const data: OhlcWithFormingResponse = {
      pair: "EUR/USD",
      interval: "5m",
      start: null,
      end: null,
      count: 2,
      candles: [
        candle("2024-01-01T10:00:00Z", 1.1, true),
        candle("2024-01-01T10:05:00Z", 1.2, true),
      ],
    };
    expect(resolveClosedCandles(data)).toHaveLength(1);
  });
});

describe("buildChartCandles", () => {
  it("merges forming at same timestamp", () => {
    const ts = "2024-01-01T10:05:00Z";
    const closed = [candle("2024-01-01T10:00:00Z", 1.1), candle(ts, 1.2)];
    const forming = candle(ts, 1.25, true);
    const merged = buildChartCandles(
      { pair: "EUR/USD", interval: "5m", start: null, end: null, count: 2, candles: closed },
      forming,
    );
    expect(merged).toHaveLength(2);
    expect(merged[1].close).toBe(1.25);
    expect(toChartTime(merged[0].timestamp)).toBeLessThan(toChartTime(merged[1].timestamp));
  });

  it("includes cached history plus forming when response candles are empty", () => {
    const cached = [
      candle("2024-01-01T10:00:00Z", 1.1),
      candle("2024-01-01T10:05:00Z", 1.2),
    ];
    const forming = candle("2024-01-01T10:10:00Z", 1.3, true);
    const merged = buildChartCandles(
      {
        pair: "EUR/USD",
        interval: "5m",
        start: null,
        end: null,
        count: 0,
        candles: [],
        has_forming_candle: true,
      },
      forming,
      cached,
    );
    expect(merged).toHaveLength(3);
    expect(merged[2].is_forming).toBe(true);
  });
});

describe("applyLivePriceToForming", () => {
  it("clamps forming wicks to closed history range", () => {
    const closed = [
      candle("2024-01-01T10:00:00Z", 1.16),
      candle("2024-01-01T10:05:00Z", 1.161),
    ];
    const forming = candle("2024-01-01T10:10:00Z", 1.162, true);
    const updated = applyLivePriceToForming(forming, 2.5, closed);
    expect(updated).not.toBeNull();
    expect(updated!.close).toBe(2.5);
    expect(updated!.high).toBeLessThanOrEqual(1.161 + 0.01);
    expect(updated!.low).toBeGreaterThanOrEqual(1.16 - 0.01);
  });
});

describe("priceRangeFromCandles", () => {
  it("returns min low and max high", () => {
    const range = priceRangeFromCandles([
      candle("2024-01-01T10:00:00Z", 1.1),
      { ...candle("2024-01-01T10:05:00Z", 1.2), low: 1.05, high: 1.25 },
    ]);
    expect(range).toEqual({ min: 1.05, max: 1.25 });
  });
});

describe("pickClosedBase", () => {
  it("prefers primary when non-empty", () => {
    const primary = [candle("2024-01-01T10:00:00Z", 1.1)];
    const fallback = [candle("2024-01-01T09:00:00Z", 1.0)];
    expect(pickClosedBase(primary, fallback)).toEqual(primary);
  });

  it("uses fallback when primary is empty", () => {
    const fallback = [candle("2024-01-01T09:00:00Z", 1.0)];
    expect(pickClosedBase([], fallback)).toEqual(fallback);
  });
});

describe("defaultVisibleRange", () => {
  it("returns null for empty data", () => {
    expect(defaultVisibleRange(0)).toBeNull();
  });

  it("shows last N bars when history is longer", () => {
    expect(defaultVisibleRange(120, 60)).toEqual({ from: 60, to: 120 });
  });

  it("shows single bar range for one candle", () => {
    expect(defaultVisibleRange(1)).toEqual({ from: 0, to: 1 });
  });
});

describe("mergeFormingCandle", () => {
  it("appends forming when timestamp is new", () => {
    const closed = [candle("2024-01-01T10:00:00Z", 1.1)];
    const forming = candle("2024-01-01T10:05:00Z", 1.2, true);
    expect(mergeFormingCandle(closed, forming)).toHaveLength(2);
  });
});

describe("chartTimeToUnix", () => {
  it("reads numeric unix seconds", () => {
    expect(chartTimeToUnix(1704110400)).toBe(1704110400);
  });
});

describe("canUpdateSeriesLastBar", () => {
  it("allows update only when times match", () => {
    expect(canUpdateSeriesLastBar(100, 100)).toBe(true);
    expect(canUpdateSeriesLastBar(100, 200)).toBe(false);
    expect(canUpdateSeriesLastBar(200, 100)).toBe(false);
  });
});

describe("seriesDataWithLiveForming", () => {
  it("updates last bar close when timestamps match", () => {
    const forming = candle("2024-01-01T10:05:00Z", 1.162, true);
    const closed = [candle("2024-01-01T10:00:00Z", 1.16)];
    const seriesData = [
      candleToSeriesPoint(closed[0]),
      candleToSeriesPoint(forming),
    ];
    const out = seriesDataWithLiveForming(seriesData, forming, 1.165, closed);
    expect(out).toHaveLength(2);
    expect(out[1].close).toBe(1.165);
  });

  it("leaves series unchanged when forming time does not match last bar", () => {
    const forming = candle("2024-01-01T10:00:00Z", 1.162, true);
    const closed = [candle("2024-01-01T10:00:00Z", 1.16)];
    const seriesData = [candleToSeriesPoint(candle("2024-01-01T10:05:00Z", 1.17))];
    const out = seriesDataWithLiveForming(seriesData, forming, 1.165, closed);
    expect(out).toBe(seriesData);
  });
});
