import { describe, expect, it, vi } from "vitest";
import type { Chart } from "klinecharts";
import {
  ALERT_OVERLAY_PREFIX,
  LIVE_OVERLAY_ID,
  alertOverlayId,
  captureChartLayout,
  chartIntervalToPeriod,
  getKLineChartStyles,
  isSystemOverlayId,
  mergedKLineData,
  ohlcListToKLineData,
  ohlcToKLineData,
  syncChartIndicators,
} from "@/lib/klinechart-utils";
import type { OhlcCandle } from "@/types/historical";

const sampleCandle: OhlcCandle = {
  timestamp: "2026-06-06T12:00:00.000000+00:00",
  open: 1.0845,
  high: 1.0851,
  low: 1.0842,
  close: 1.0848,
  volume: 42,
};

describe("ohlcToKLineData", () => {
  it("converts ISO timestamp to milliseconds", () => {
    const point = ohlcToKLineData(sampleCandle);
    expect(point.timestamp).toBe(Math.floor(new Date(sampleCandle.timestamp).getTime() / 1000) * 1000);
    expect(point.open).toBe(1.0845);
    expect(point.close).toBe(1.0848);
  });
});

describe("ohlcListToKLineData", () => {
  it("deduplicates and sorts by time", () => {
    const later: OhlcCandle = {
      ...sampleCandle,
      timestamp: "2026-06-06T12:05:00.000000+00:00",
      close: 1.085,
    };
    const data = ohlcListToKLineData([later, sampleCandle, sampleCandle]);
    expect(data).toHaveLength(2);
    expect(data[0].timestamp).toBeLessThan(data[1].timestamp);
  });
});

describe("chartIntervalToPeriod", () => {
  it("maps 5m to minute span 5", () => {
    expect(chartIntervalToPeriod("5m")).toEqual({ span: 5, type: "minute" });
  });

  it("maps 1d to day span 1", () => {
    expect(chartIntervalToPeriod("1d")).toEqual({ span: 1, type: "day" });
  });
});

describe("mergedKLineData", () => {
  it("replaces last bar when forming shares timestamp", () => {
    const forming: OhlcCandle = {
      ...sampleCandle,
      close: 1.085,
      is_forming: true,
    };
    const data = mergedKLineData([sampleCandle], forming);
    expect(data).toHaveLength(1);
    expect(data[0].close).toBe(1.085);
  });

  it("appends forming bar when timestamp is new", () => {
    const forming: OhlcCandle = {
      ...sampleCandle,
      timestamp: "2026-06-06T12:05:00.000000+00:00",
      close: 1.085,
      is_forming: true,
    };
    const data = mergedKLineData([sampleCandle], forming);
    expect(data).toHaveLength(2);
    expect(data[1].close).toBe(1.085);
  });
});

describe("alertOverlayId", () => {
  it("prefixes alert ids", () => {
    expect(alertOverlayId("abc-123")).toBe("fx-alert-abc-123");
  });
});

describe("isSystemOverlayId", () => {
  it("recognizes live price and alert overlays", () => {
    expect(isSystemOverlayId(LIVE_OVERLAY_ID)).toBe(true);
    expect(isSystemOverlayId(`${ALERT_OVERLAY_PREFIX}xyz`)).toBe(true);
    expect(isSystemOverlayId("user-trend-line")).toBe(false);
    expect(isSystemOverlayId(undefined)).toBe(false);
  });
});

describe("getKLineChartStyles", () => {
  it("uses subtle horizontal grids and hides vertical lines in dark mode", () => {
    const styles = getKLineChartStyles(true);
    expect(styles.grid?.vertical?.show).toBe(false);
    expect(styles.grid?.horizontal?.style).toBe("solid");
    expect(styles.grid?.horizontal?.color).toBe("rgba(255,255,255,0.06)");
  });

  it("uses subtle horizontal grids in light mode", () => {
    const styles = getKLineChartStyles(false);
    expect(styles.grid?.vertical?.show).toBe(false);
    expect(styles.grid?.horizontal?.color).toBe("rgba(0,0,0,0.06)");
  });
});

describe("syncChartIndicators", () => {
  it("removes stale indicators and creates missing ones", () => {
    const createIndicator = vi.fn();
    const removeIndicator = vi.fn();
    const chart = {
      getIndicators: vi.fn((filter?: { name?: string }) => {
        if (filter?.name === "MA") {
          return [{ name: "MA" }];
        }
        if (filter?.name === "RSI") {
          return [];
        }
        return [{ name: "MA" }, { name: "MACD" }];
      }),
      createIndicator,
      removeIndicator,
    } as unknown as Chart;

    syncChartIndicators(chart, ["MA", "RSI"]);

    expect(removeIndicator).toHaveBeenCalledWith({ name: "MACD" });
    expect(createIndicator).toHaveBeenCalledWith("RSI", {
      isStack: false,
      pane: undefined,
    });
    expect(createIndicator).not.toHaveBeenCalledWith("MA", expect.anything());
  });
});

describe("captureChartLayout", () => {
  it("merges indicator names from chart and ref", () => {
    const chart = {
      getIndicators: () => [{ name: "MA" }, { name: "MACD" }],
      getOverlays: () => [],
    } as unknown as Chart;

    const layout = captureChartLayout(chart, ["RSI"]);
    expect(layout.indicators.sort()).toEqual(["MA", "MACD", "RSI"].sort());
  });
});
