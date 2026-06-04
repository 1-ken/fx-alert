import type {
  CandlestickData,
  ChartOptions,
  DeepPartial,
  LogicalRange,
  Time,
} from "lightweight-charts";
import type { OhlcCandle, OhlcWithFormingResponse } from "@/types/historical";

export const CHART_INTERVAL_OPTIONS = ["1m", "5m", "15m", "30m", "1h", "4h", "1d"] as const;
export type ChartInterval = (typeof CHART_INTERVAL_OPTIONS)[number];

export function toChartTime(iso: string): number {
  return Math.floor(new Date(iso).getTime() / 1000);
}

/** Normalize lightweight-charts Time to unix seconds for comparisons. */
export function chartTimeToUnix(time: Time | undefined): number | null {
  if (time === undefined || time === null) {
    return null;
  }
  if (typeof time === "number") {
    return time;
  }
  if (typeof time === "string") {
    const n = Math.floor(new Date(time).getTime() / 1000);
    return Number.isFinite(n) ? n : null;
  }
  if (
    typeof time === "object" &&
    "year" in time &&
    "month" in time &&
    "day" in time
  ) {
    return Math.floor(
      new Date(time.year, time.month - 1, time.day).getTime() / 1000,
    );
  }
  return null;
}

/** True when update() may safely modify the series' last bar (same time, not older). */
export function canUpdateSeriesLastBar(
  seriesLastTime: number | null,
  pointTime: number | null,
): boolean {
  return (
    seriesLastTime !== null &&
    pointTime !== null &&
    seriesLastTime === pointTime
  );
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

export function closedCandlesFromResponse(data: OhlcWithFormingResponse | undefined): OhlcCandle[] {
  if (!data?.candles?.length) {
    return [];
  }
  return data.candles.filter((c) => !c.is_forming);
}

export function extractFormingCandle(
  data: OhlcWithFormingResponse | undefined,
): OhlcCandle | null {
  if (!data) {
    return null;
  }
  if (data.forming_candle && data.forming_candle.is_forming !== false) {
    return data.forming_candle;
  }
  return data.candles.find((c) => c.is_forming) ?? null;
}

/** Min/max low/high across candles (for stable chart autoscale). */
export function priceRangeFromCandles(
  candles: OhlcCandle[],
): { min: number; max: number } | null {
  if (candles.length === 0) {
    return null;
  }
  let min = Infinity;
  let max = -Infinity;
  for (const candle of candles) {
    min = Math.min(min, candle.low);
    max = Math.max(max, candle.high);
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return null;
  }
  return { min, max };
}

/** Apply live mid price to the forming bar between OHLC poll refreshes. */
export function applyLivePriceToForming(
  forming: OhlcCandle | null,
  livePrice: number | undefined,
  closedForScale?: OhlcCandle[],
): OhlcCandle | null {
  if (!forming || typeof livePrice !== "number" || !Number.isFinite(livePrice)) {
    return forming;
  }
  const updated: OhlcCandle = {
    ...forming,
    close: livePrice,
    high: Math.max(forming.high, livePrice),
    low: Math.min(forming.low, livePrice),
  };
  const range = closedForScale?.length
    ? priceRangeFromCandles(closedForScale)
    : null;
  if (!range) {
    return updated;
  }
  const pad = Math.max((range.max - range.min) * 0.05, 0.00005);
  return {
    ...updated,
    high: Math.min(updated.high, range.max + pad),
    low: Math.max(updated.low, range.min - pad),
  };
}

/** Replace the last bar with live forming OHLC when timestamps align. */
export function seriesDataWithLiveForming(
  seriesData: CandlestickData[],
  forming: OhlcCandle | null,
  livePrice: number | undefined,
  closedForScale: OhlcCandle[],
): CandlestickData[] {
  if (!forming || seriesData.length === 0) {
    return seriesData;
  }
  const liveForming = applyLivePriceToForming(forming, livePrice, closedForScale);
  if (!liveForming) {
    return seriesData;
  }
  const point = candleToSeriesPoint(liveForming);
  const lastTime = chartTimeToUnix(seriesData[seriesData.length - 1].time);
  const pointTime = chartTimeToUnix(point.time);
  if (!canUpdateSeriesLastBar(lastTime, pointTime)) {
    return seriesData;
  }
  return [...seriesData.slice(0, -1), point];
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

/** Resolve closed candles from API, with fallback when bucket filter returns an empty array. */
export function resolveClosedCandles(
  data: OhlcWithFormingResponse | undefined,
  cachedClosed: OhlcCandle[] = [],
): OhlcCandle[] {
  const closed = closedCandlesFromResponse(data);
  if (closed.length > 0) {
    return closed;
  }

  const raw = data?.candles ?? [];
  if (raw.length > 0) {
    const fromApi = raw.filter((c) => !c.is_forming);
    if (fromApi.length > 0) {
      return fromApi;
    }
    if (raw.length > 1) {
      return raw.slice(0, -1);
    }
  }

  if (data?.has_forming_candle && cachedClosed.length > 0) {
    return cachedClosed;
  }

  return closed;
}

/** Default logical range showing the most recent N bars (lightweight-charts). */
export function defaultVisibleRange(
  dataLength: number,
  visibleBars = 60,
): LogicalRange | null {
  if (dataLength < 1) {
    return null;
  }
  if (dataLength === 1) {
    return { from: 0 as LogicalRange["from"], to: dataLength as LogicalRange["to"] };
  }
  const bars = Math.min(visibleBars, dataLength);
  return {
    from: Math.max(0, dataLength - bars) as LogicalRange["from"],
    to: dataLength as LogicalRange["to"],
  };
}

/** Prefer primary closed history; use fallback when forming endpoint returned none. */
export function pickClosedBase(primary: OhlcCandle[], fallback: OhlcCandle[]): OhlcCandle[] {
  return primary.length > 0 ? primary : fallback;
}

/** Closed history plus optional forming bar for chart rendering. */
export function buildChartCandles(
  data: OhlcWithFormingResponse | undefined,
  forming: OhlcCandle | null | undefined,
  cachedClosed: OhlcCandle[] = [],
): OhlcCandle[] {
  const closed = resolveClosedCandles(data, cachedClosed);
  return mergeFormingCandle(closed, forming);
}

export function getChartScaleOptions(isMobile: boolean) {
  if (!isMobile) {
    return {
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
      },
    };
  }

  return {
    rightPriceScale: {
      borderVisible: true,
      minimumWidth: 56,
      scaleMargins: { top: 0.08, bottom: 0.08 },
    },
    timeScale: {
      borderVisible: true,
      timeVisible: true,
      secondsVisible: false,
      rightOffset: 8,
    },
  };
}

export function getChartTheme(isDark: boolean, isMobile = false): {
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
  const fontSize = isMobile ? 12 : undefined;

  if (isDark) {
    return {
      layout: {
        background: { color: "transparent" },
        textColor: "#a1a1aa",
        ...(fontSize ? { fontSize } : {}),
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
      ...(fontSize ? { fontSize } : {}),
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
