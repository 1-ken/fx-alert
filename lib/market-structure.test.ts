import { describe, expect, it } from "vitest";
import { computeMarketStructure } from "@/lib/market-structure";
import type { OhlcCandle as Candle } from "@/types/historical";

function bar(
  i: number,
  open: number,
  high: number,
  low: number,
  close: number,
  forming = false,
): Candle {
  const t = Date.UTC(2026, 2, 10, 0, i * 5, 0);
  return {
    timestamp: new Date(t).toISOString(),
    open,
    high,
    low,
    close,
    volume: 1,
    is_forming: forming,
  };
}

describe("computeMarketStructure", () => {
  it("emits BOS on close through last high, then CHoCH on close through last low", () => {
    const candles: Candle[] = [
      bar(0, 100, 101, 99, 100),
      bar(1, 100, 105, 100, 104),
      bar(2, 104, 104.2, 102, 103),
      bar(3, 103, 103, 98, 99),
      bar(4, 99, 100, 95, 96),
      bar(5, 96, 98, 96, 97),
      bar(6, 97, 108, 97, 107),
      bar(7, 107, 107, 94, 94),
    ];

    const result = computeMarketStructure(candles, { breakK: 0, minSwingATR: 0 });
    const kinds = result.events.map((e) => e.kind);

    expect(kinds).toContain("BOS");
    expect(kinds).toContain("CHoCH");
    const bos = result.events.find((e) => e.kind === "BOS");
    expect(bos?.dir).toBe("bull");
    expect(bos?.level).toBe(105);
    const choch = result.events.find((e) => e.kind === "CHoCH");
    expect(choch?.dir).toBe("bear");
    expect(result.trend).toBe("down");
  });

  it("emits SWEEP when wick takes a high but close stays below", () => {
    const candles: Candle[] = [
      bar(0, 100, 101, 99, 100),
      bar(1, 100, 105, 100, 104),
      bar(2, 104, 104.2, 102, 103),
      bar(3, 103, 106.5, 101, 102),
    ];

    const result = computeMarketStructure(candles, { breakK: 0, minSwingATR: 0 });
    const sweep = result.events.find((e) => e.kind === "SWEEP");
    expect(sweep).toBeDefined();
    expect(sweep?.dir).toBe("bear");
    expect(sweep?.level).toBe(105);
    expect(result.events.some((e) => e.kind === "BOS")).toBe(false);
  });

  it("ignores forming candles", () => {
    const candles: Candle[] = [
      bar(0, 100, 101, 99, 100),
      bar(1, 100, 105, 100, 104),
      bar(2, 104, 104.2, 102, 103),
      bar(3, 103, 103, 98, 99),
      bar(4, 99, 100, 95, 96),
      bar(5, 96, 98, 96, 97),
      bar(6, 97, 108, 97, 107, true),
    ];

    const result = computeMarketStructure(candles, { breakK: 0 });
    expect(result.events.some((e) => e.kind === "BOS")).toBe(false);
  });
});
