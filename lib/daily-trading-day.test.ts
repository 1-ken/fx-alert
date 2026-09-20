import { describe, expect, it, vi, afterEach } from "vitest";
import {
  formatTradingDayLabel,
  isTodayTradingDayCandle,
  normalizeClosedDailyCandles,
  normalizeFormingDailyCandle,
  normalizeTradingDayIso,
  normalizeTradingDayMs,
  todayTradingDayStartMs,
} from "@/lib/daily-trading-day";
import { computeLiveBiasDetails } from "@/lib/draw-on-liquidity";
import type { OhlcCandle } from "@/types/historical";

function candle(
  timestamp: string,
  open: number,
  high: number,
  low: number,
  close: number,
  isForming = false,
): OhlcCandle {
  return {
    timestamp,
    open,
    high,
    low,
    close,
    volume: 1,
    is_forming: isForming,
  };
}

describe("normalizeTradingDayMs", () => {
  it("maps Thu 22:00 UTC open to Friday trading day", () => {
    expect(normalizeTradingDayIso("2026-06-18T22:00:00Z")).toBe(
      "2026-06-19T00:00:00.000Z",
    );
  });

  it("leaves true midnight-aligned bars unchanged", () => {
    expect(normalizeTradingDayIso("2026-06-19T00:00:00Z")).toBe(
      "2026-06-19T00:00:00.000Z",
    );
  });

  it("maps Sunday evening open to Monday trading day", () => {
    expect(normalizeTradingDayIso("2026-06-21T22:00:00Z")).toBe(
      "2026-06-22T00:00:00.000Z",
    );
  });
});

describe("normalizeClosedDailyCandles", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("dedupes by trading day and drops today's forming day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-22T10:00:00Z"));

    const closed = normalizeClosedDailyCandles([
      candle("2026-06-17T00:00:00Z", 1, 2, 0.5, 1.5),
      candle("2026-06-18T22:00:00Z", 2, 3, 1.5, 2.5),
      candle("2026-06-21T22:00:00Z", 2.5, 3.5, 2, 3, true),
    ]);

    expect(closed).toHaveLength(2);
    expect(closed[0].timestamp).toBe("2026-06-17T00:00:00.000Z");
    expect(closed[1].timestamp).toBe("2026-06-19T00:00:00.000Z");
    expect(closed[1].high).toBe(3);
  });
});

describe("Monday live bias reference", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("classifies from Friday when Friday bar opens Thu evening", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-22T10:00:00Z"));

    const closed = normalizeClosedDailyCandles([
      candle("2026-06-17T00:00:00Z", 100, 110, 90, 105),
      candle("2026-06-18T00:00:00Z", 105, 108, 100, 106),
      candle("2026-06-18T22:00:00Z", 106, 115, 104, 113),
    ]);

    const details = computeLiveBiasDetails(closed, null);
    expect(details?.classifiedDate).toBe("2026-06-19");
    expect(details?.pdhReferenceDate).toBe("2026-06-19");
    expect(details?.classified.high).toBe(115);
    expect(details?.classified.outcome).toBe("displaced_up");
  });
});

describe("isTodayTradingDayCandle", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("accepts forming bars normalized to today's trading day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-22T12:00:00Z"));

    const forming = normalizeFormingDailyCandle(
      candle("2026-06-21T22:00:00Z", 1, 2, 0.5, 1.5, true),
    );
    expect(isTodayTradingDayCandle(forming)).toBe(true);
    expect(normalizeTradingDayMs(forming.timestamp)).toBe(
      todayTradingDayStartMs(),
    );
  });
});

describe("formatTradingDayLabel", () => {
  it("formats normalized trading days readably", () => {
    expect(formatTradingDayLabel("2026-06-19T00:00:00Z")).toBe("19 Jun 2026");
  });
});
