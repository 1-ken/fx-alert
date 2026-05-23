import type { CandlestickData, DeepPartial, ChartOptions } from "lightweight-charts";
import type { OhlcCandle } from "@/types/historical";

export const CHART_INTERVAL_OPTIONS = ["1m", "5m", "15m", "30m", "1h", "4h", "1d"] as const;
export type ChartInterval = (typeof CHART_INTERVAL_OPTIONS)[number];

export function toChartTime(iso: string): number {
  return Math.floor(new Date(iso).getTime() / 1000);
}

export function candleToSeriesPoint(candle: OhlcCandle): CandlestickData {
  return {
    time: toChartTime(candle.timestamp) as CandlestickData["time"],
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
  };
}

export function candlesToSeriesData(candles: OhlcCandle[]): CandlestickData[] {
  const sorted = [...candles].sort(
    (a, b) => toChartTime(a.timestamp) - toChartTime(b.timestamp),
  );
  const byTime = new Map<number, CandlestickData>();
  for (const candle of sorted) {
    const point = candleToSeriesPoint(candle);
    byTime.set(point.time as number, point);
  }
  return Array.from(byTime.values()).sort(
    (a, b) => (a.time as number) - (b.time as number),
  );
}

export function mergeFormingCandle(
  closed: OhlcCandle[],
  forming: OhlcCandle | null | undefined,
): OhlcCandle[] {
  if (!forming) {
    return closed;
  }
  const merged = [...closed];
  const formingTime = toChartTime(forming.timestamp);
  let replaceIndex = -1;
  for (let i = merged.length - 1; i >= 0; i -= 1) {
    if (toChartTime(merged[i].timestamp) === formingTime) {
      replaceIndex = i;
      break;
    }
  }
  if (replaceIndex >= 0) {
    merged[replaceIndex] = forming;
  } else {
    merged.push(forming);
  }
  return merged;
}

export function getChartTheme(isDark: boolean): {
  layout: DeepPartial<ChartOptions>["layout"];
  grid: DeepPartial<ChartOptions>["grid"];
  candlestick: {
    upColor: string;
    downColor: string;
    borderUpColor: string;
    borderDownColor: string;
    wickUpColor: string;
    wickDownColor: string;
  };
} {
  if (isDark) {
    return {
      layout: {
        background: { color: "transparent" },
        textColor: "#a1a1aa",
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.06)" },
        horzLines: { color: "rgba(255,255,255,0.06)" },
      },
      candlestick: {
        upColor: "#22c55e",
        downColor: "#ef4444",
        borderUpColor: "#22c55e",
        borderDownColor: "#ef4444",
        wickUpColor: "#22c55e",
        wickDownColor: "#ef4444",
      },
    };
  }
  return {
    layout: {
      background: { color: "transparent" },
      textColor: "#71717a",
    },
    grid: {
      vertLines: { color: "rgba(0,0,0,0.06)" },
      horzLines: { color: "rgba(0,0,0,0.06)" },
    },
    candlestick: {
      upColor: "#16a34a",
      downColor: "#dc2626",
      borderUpColor: "#16a34a",
      borderDownColor: "#dc2626",
      wickUpColor: "#16a34a",
      wickDownColor: "#dc2626",
    },
  };
}
