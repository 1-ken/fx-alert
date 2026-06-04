"use client";

import { useEffect, useMemo, useRef } from "react";
import { useTheme } from "next-themes";
import {
  CandlestickSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
} from "lightweight-charts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useHistoricalOhlc,
  useHistoricalOhlcWithForming,
} from "@/hooks/historical/use-historical";
import {
  candlesToSeriesData,
  CHART_INTERVAL_OPTIONS,
  getChartTheme,
  buildChartCandles,
  extractFormingCandle,
  type ChartInterval,
} from "@/lib/chart-utils";

export interface CandlestickChartProps {
  pair: string;
  interval?: ChartInterval;
  limit?: number;
  height?: number;
  showForming?: boolean;
  showIntervalSelect?: boolean;
  onIntervalChange?: (interval: ChartInterval) => void;
  className?: string;
}

export function CandlestickChart({
  pair,
  interval = "5m",
  limit = 100,
  height = 320,
  showForming = true,
  showIntervalSelect = false,
  onIntervalChange,
  className,
}: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const ohlcParams = useMemo(
    () => ({ pair, interval, limit }),
    [pair, interval, limit],
  );

  const formingQuery = useHistoricalOhlcWithForming(
    showForming ? ohlcParams : { pair: "", interval },
  );
  const closedQuery = useHistoricalOhlc(
    showForming ? { pair: "", interval } : ohlcParams,
  );

  const activeQuery = showForming ? formingQuery : closedQuery;
  const { data, isInitialLoading, error } = activeQuery;

  const seriesData = useMemo(() => {
    const forming =
      showForming && data && "forming_candle" in data
        ? (data.forming_candle ?? extractFormingCandle(data))
        : null;
    const merged = buildChartCandles(data, forming ?? null);
    return candlesToSeriesData(merged);
  }, [data, showForming]);

  const theme = useMemo(() => getChartTheme(isDark), [isDark]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const chart = createChart(container, {
      width: container.clientWidth,
      height,
      layout: theme.layout,
      grid: theme.grid,
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
      crosshair: { mode: 1 },
    });

    const series = chart.addSeries(CandlestickSeries, theme.candlestick);

    chartRef.current = chart;
    seriesRef.current = series;

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      chart.applyOptions({ width: entry.contentRect.width });
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [height, theme.candlestick, theme.grid, theme.layout]);

  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) {
      return;
    }
    chart.applyOptions({
      layout: theme.layout,
      grid: theme.grid,
    });
    series.applyOptions(theme.candlestick);
  }, [theme]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) {
      return;
    }
    if (seriesData.length === 0) {
      series.setData([]);
      return;
    }
    series.setData(seriesData);
    chartRef.current?.timeScale().fitContent();
  }, [seriesData]);

  const pairLabel = pair.replace("/", "").toUpperCase();
  const showSkeleton = isInitialLoading && !data;
  const showEmpty = !showSkeleton && !error && seriesData.length === 0;
  const showChart = !showSkeleton && !error && seriesData.length > 0;

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base">
          {pairLabel} · {interval} candles
        </CardTitle>
        {showIntervalSelect && onIntervalChange ? (
          <Select value={interval} onValueChange={(v) => onIntervalChange(v as ChartInterval)}>
            <SelectTrigger className="h-8 w-[88px]" aria-label="Candle interval">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CHART_INTERVAL_OPTIONS.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </CardHeader>
      <CardContent>
        {showSkeleton ? <Skeleton className="w-full" style={{ height }} /> : null}
        {error ? (
          <p className="text-sm text-destructive" style={{ minHeight: height }}>
            Could not load chart data.
          </p>
        ) : null}
        {showEmpty ? (
          <p
            className="flex items-center text-sm text-muted-foreground"
            style={{ minHeight: height }}
          >
            No candle data yet.
          </p>
        ) : null}
        <div
          ref={containerRef}
          className={showChart ? "w-full" : "hidden"}
          style={{ height }}
          aria-hidden={!showChart}
        />
      </CardContent>
    </Card>
  );
}
