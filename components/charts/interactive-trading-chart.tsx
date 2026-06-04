"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import {
  CandlestickSeries,
  createChart,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type LogicalRange,
  type MouseEventParams,
  type Time,
} from "lightweight-charts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  useHistoricalOhlc,
  useHistoricalOhlcWithForming,
} from "@/hooks/historical/use-historical";
import { useObserverAlerts } from "@/hooks/alerts/use-alerts";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  applyLivePriceToForming,
  buildChartCandles,
  candlesToSeriesData,
  canUpdateSeriesLastBar,
  chartTimeToUnix,
  CHART_INTERVAL_OPTIONS,
  defaultVisibleRange,
  extractFormingCandle,
  getChartScaleOptions,
  getChartTheme,
  pickClosedBase,
  priceRangeFromCandles,
  resolveClosedCandles,
  seriesDataWithLiveForming,
  type ChartInterval,
} from "@/lib/chart-utils";
import type { OhlcCandle } from "@/types/historical";
import type { Alert } from "@/types/alerts";
import { cn } from "@/lib/utils";
import { PlusIcon } from "@heroicons/react/24/outline";

export type ChartAlertDraft = {
  pair: string;
  alertType: "price" | "candle_close";
  price: number;
  interval: ChartInterval;
  candleTime?: string;
};

export interface InteractiveTradingChartProps {
  pair: string;
  livePrice?: number;
  interval?: ChartInterval;
  limit?: number;
  height?: number;
  onCreateAlert?: (draft: ChartAlertDraft) => void;
  className?: string;
}

const LIVE_LINE_COLOR = "#ef4444";

function normalizePairKey(pair: string): string {
  return pair.replace(/[^a-z0-9]/gi, "").toUpperCase();
}

function alertPrice(alert: Alert): number | null {
  if (alert.alert_type === "price") {
    return alert.target_price;
  }
  return alert.threshold;
}

function hapticTap(): void {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(10);
  }
}

/**
 * TradingView-style interactive candlestick chart with alert lines and creation affordances.
 */
export function InteractiveTradingChart({
  pair,
  livePrice,
  interval: intervalProp = "5m",
  limit = 120,
  height = 380,
  onCreateAlert,
  className,
}: InteractiveTradingChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const priceLineRef = useRef<IPriceLine | null>(null);
  const alertLinesRef = useRef<Map<string, IPriceLine>>(new Map());
  const initialRangeRef = useRef<LogicalRange | null>(null);
  const userHasPannedRef = useRef(false);
  const dataContextRef = useRef("");
  const prevSeriesLengthRef = useRef(0);
  const prevClosedCountRef = useRef(0);
  const prevLastBarTimeRef = useRef<number | null>(null);
  const closedScaleRangeRef = useRef<{ min: number; max: number } | null>(null);
  const pairAlertsRef = useRef<Alert[]>([]);
  const isMobileRef = useRef(false);
  const lastBarTimeRef = useRef<number | null>(null);
  const openAlertDraftRef = useRef<
    (alertType: "price" | "candle_close", price: number, candleTime?: string) => void
  >(() => undefined);

  const [interval, setInterval] = useState<ChartInterval>(intervalProp);
  const [hoverY, setHoverY] = useState<number | null>(null);
  const [hoverPrice, setHoverPrice] = useState<number | null>(null);
  const [hoverTimeLabel, setHoverTimeLabel] = useState<string | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [clickPopover, setClickPopover] = useState<{
    y: number;
    price: number;
  } | null>(null);
  const [formingPulse, setFormingPulse] = useState(false);
  const [resetFlash, setResetFlash] = useState(false);
  const [latestFlash, setLatestFlash] = useState(false);
  const [cachedClosed, setCachedClosed] = useState<OhlcCandle[]>([]);

  const isMobile = useIsMobile();

  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const { alerts } = useObserverAlerts();

  const pairKey = normalizePairKey(pair);
  const pairAlerts = useMemo(
    () =>
      alerts.active.filter(
        (alert) =>
          normalizePairKey(alert.pair) === pairKey &&
          alert.alert_type === "price" &&
          alert.target_price !== null,
      ),
    [alerts.active, pairKey],
  );

  const ohlcParams = useMemo(() => ({ pair, interval, limit }), [pair, interval, limit]);

  const {
    data: ohlcData,
    isInitialLoading: ohlcLoading,
    isRefreshing,
    error: ohlcError,
  } = useHistoricalOhlcWithForming(ohlcParams, { mobileRefresh: isMobile });

  const needsClosedFallback = useMemo(
    () =>
      Boolean(
        ohlcData?.has_forming_candle &&
          resolveClosedCandles(ohlcData, cachedClosed).length === 0,
      ),
    [ohlcData, cachedClosed],
  );

  const fallbackOhlcParams = useMemo(
    () => (needsClosedFallback ? ohlcParams : { pair: "", interval }),
    [needsClosedFallback, ohlcParams],
  );

  const { data: fallbackOhlcData } = useHistoricalOhlc(fallbackOhlcParams);

  const fallbackClosed = useMemo(() => {
    if (!needsClosedFallback || !fallbackOhlcData?.candles?.length) {
      return [];
    }
    return fallbackOhlcData.candles.filter((c) => !c.is_forming);
  }, [fallbackOhlcData, needsClosedFallback]);

  const closedBase = useMemo(
    () => pickClosedBase(cachedClosed, fallbackClosed),
    [cachedClosed, fallbackClosed],
  );

  const formingCandleApi = useMemo(
    () => extractFormingCandle(ohlcData),
    [ohlcData],
  );

  const closedForChart = useMemo(
    () => resolveClosedCandles(ohlcData, closedBase),
    [ohlcData, closedBase],
  );

  const formingCandle = useMemo(
    () => applyLivePriceToForming(formingCandleApi, livePrice, closedForChart),
    [formingCandleApi, livePrice, closedForChart],
  );

  const closedBarCount = closedForChart.length;

  const chartCandles = useMemo(
    () => buildChartCandles(ohlcData, formingCandleApi, closedBase),
    [ohlcData, formingCandleApi, closedBase],
  );

  const seriesData = useMemo(
    () => candlesToSeriesData(chartCandles),
    [chartCandles],
  );

  const displaySeriesData = useMemo(
    () =>
      seriesDataWithLiveForming(
        seriesData,
        formingCandleApi,
        livePrice,
        closedForChart,
      ),
    [seriesData, formingCandleApi, livePrice, closedForChart],
  );

  useEffect(() => {
    const closed = resolveClosedCandles(ohlcData);
    if (closed.length > 0) {
      setCachedClosed((prev) => {
        const unchanged =
          prev.length === closed.length &&
          prev.length > 0 &&
          prev[prev.length - 1]?.timestamp === closed[closed.length - 1]?.timestamp;
        return unchanged ? prev : closed;
      });
    }
  }, [ohlcData]);

  useEffect(() => {
    const fromApi = resolveClosedCandles(ohlcData);
    const scaleSource =
      fromApi.length > 0 ? fromApi : pickClosedBase(cachedClosed, fallbackClosed);
    closedScaleRangeRef.current = priceRangeFromCandles(scaleSource);
  }, [ohlcData, cachedClosed, fallbackClosed]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) {
      return;
    }
    series.applyOptions({
      autoscaleInfoProvider: () => {
        const range = closedScaleRangeRef.current;
        if (!range) {
          return null;
        }
        const pad = Math.max((range.max - range.min) * 0.08, 0.00005);
        return {
          priceRange: {
            minValue: range.min - pad,
            maxValue: range.max + pad,
          },
        };
      },
    });
  }, [ohlcData, cachedClosed, fallbackClosed]);

  useEffect(() => {
    if (
      process.env.NODE_ENV === "development" &&
      formingCandle &&
      seriesData.length < 5
    ) {
      console.warn(
        "[InteractiveTradingChart] Sparse series with forming candle:",
        { seriesBars: seriesData.length, closedBarCount, needsClosedFallback },
      );
    }
  }, [closedBarCount, formingCandle, needsClosedFallback, seriesData.length]);

  useEffect(() => {
    const last = displaySeriesData.at(-1);
    lastBarTimeRef.current = chartTimeToUnix(last?.time);
  }, [displaySeriesData]);

  useEffect(() => {
    if (typeof livePrice !== "number") {
      return;
    }
    setFormingPulse(true);
    const t = setTimeout(() => setFormingPulse(false), 350);
    return () => clearTimeout(t);
  }, [livePrice]);

  const theme = useMemo(() => getChartTheme(isDark, isMobile), [isDark, isMobile]);
  const scaleOptions = useMemo(() => getChartScaleOptions(isMobile), [isMobile]);

  const flashButton = useCallback((which: "reset" | "latest") => {
    if (which === "reset") {
      setResetFlash(true);
      setTimeout(() => setResetFlash(false), 400);
    } else {
      setLatestFlash(true);
      setTimeout(() => setLatestFlash(false), 400);
    }
    hapticTap();
  }, []);

  const resetView = useCallback(() => {
    const chart = chartRef.current;
    if (!chart) {
      return;
    }
    userHasPannedRef.current = false;
    if (initialRangeRef.current) {
      chart.timeScale().setVisibleLogicalRange(initialRangeRef.current);
    } else {
      chart.timeScale().fitContent();
    }
    flashButton("reset");
    toast.message("Chart view reset");
  }, [flashButton]);

  const scrollToLatest = useCallback(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) {
      return;
    }

    const dataLength = seriesData.length;
    const range = defaultVisibleRange(dataLength, isMobile ? 40 : 60);
    if (range) {
      chart.timeScale().setVisibleLogicalRange(range);
    } else {
      chart.timeScale().scrollToRealTime();
    }

    flashButton("latest");
    toast.message("Showing latest candles");
  }, [flashButton, isMobile, seriesData.length]);

  const openAlertDraft = useCallback(
    (alertType: "price" | "candle_close", price: number, candleTime?: string) => {
      onCreateAlert?.({
        pair,
        alertType,
        price,
        interval,
        candleTime,
      });
      setPopoverOpen(false);
    },
    [interval, onCreateAlert, pair],
  );

  useEffect(() => {
    isMobileRef.current = isMobile;
  }, [isMobile]);

  useEffect(() => {
    pairAlertsRef.current = pairAlerts;
  }, [pairAlerts]);

  useEffect(() => {
    openAlertDraftRef.current = openAlertDraft;
  }, [openAlertDraft]);

  useEffect(() => {
    setInterval(intervalProp);
  }, [intervalProp]);

  useEffect(() => {
    dataContextRef.current = `${pair}|${interval}`;
    userHasPannedRef.current = false;
    prevSeriesLengthRef.current = 0;
    prevClosedCountRef.current = 0;
    prevLastBarTimeRef.current = null;
    setCachedClosed([]);
    closedScaleRangeRef.current = null;
    initialRangeRef.current = null;
    seriesRef.current?.setData([]);
  }, [pair, interval]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const alertLines = alertLinesRef.current;

    const chart = createChart(container, {
      width: container.clientWidth,
      height,
      layout: theme.layout,
      grid: theme.grid,
      rightPriceScale: scaleOptions.rightPriceScale,
      timeScale: scaleOptions.timeScale,
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    });

    const series = chart.addSeries(CandlestickSeries, theme.candlestick);
    chartRef.current = chart;
    seriesRef.current = series;

    const markUserPanned = () => {
      userHasPannedRef.current = true;
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(markUserPanned);

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      chart.applyOptions({ width: entry.contentRect.width });
    });
    resizeObserver.observe(container);

    chart.subscribeCrosshairMove((param: MouseEventParams<Time>) => {
      if (!param.point || param.point.y < 0) {
        setHoverY(null);
        setHoverPrice(null);
        setHoverTimeLabel(null);
        return;
      }

      const price = series.coordinateToPrice(param.point.y);
      setHoverY(param.point.y);
      setHoverPrice(typeof price === "number" ? price : null);

      if (param.time) {
        let ms: number | null = null;
        if (typeof param.time === "number") {
          ms = param.time * 1000;
        } else if (
          typeof param.time === "object" &&
          "year" in param.time &&
          "month" in param.time &&
          "day" in param.time
        ) {
          ms = new Date(
            `${param.time.year}-${param.time.month}-${param.time.day}`,
          ).getTime();
        }
        setHoverTimeLabel(ms !== null ? new Date(ms).toLocaleString() : null);
      } else {
        setHoverTimeLabel(null);
      }
    });

    chart.subscribeClick((param: MouseEventParams<Time>) => {
      if (!param.point || !onCreateAlert) {
        return;
      }

      const price = series.coordinateToPrice(param.point.y);
      if (typeof price !== "number") {
        return;
      }

      if (isMobileRef.current) {
        const clickedTime =
          typeof param.time === "number" ? param.time : null;
        if (
          clickedTime !== null &&
          lastBarTimeRef.current !== null &&
          clickedTime === lastBarTimeRef.current
        ) {
          openAlertDraftRef.current("candle_close", price);
        }
        return;
      }

      if (!param.time) {
        return;
      }

      setClickPopover({ y: param.point.y, price });
      setPopoverOpen(true);
    });

    return () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(markUserPanned);
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      priceLineRef.current = null;
      alertLines.clear();
    };
  }, [height, onCreateAlert, scaleOptions, theme]);

  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) {
      return;
    }
    chart.applyOptions({
      layout: theme.layout,
      grid: theme.grid,
      rightPriceScale: scaleOptions.rightPriceScale,
      timeScale: scaleOptions.timeScale,
    });
    series.applyOptions(theme.candlestick);
  }, [scaleOptions, theme]);

  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart) {
      return;
    }

    if (displaySeriesData.length === 0) {
      series.setData([]);
      prevSeriesLengthRef.current = 0;
      prevLastBarTimeRef.current = null;
      return;
    }

    const contextKey = dataContextRef.current;
    const isContextChange = prevSeriesLengthRef.current === 0 && !initialRangeRef.current;
    const savedRange = chart.timeScale().getVisibleLogicalRange();
    const sameLength = displaySeriesData.length === prevSeriesLengthRef.current;
    const last = displaySeriesData[displaySeriesData.length - 1];
    const lastTime = chartTimeToUnix(last.time);
    const closedCountChanged = closedBarCount !== prevClosedCountRef.current;
    const historyExpanded =
      !userHasPannedRef.current &&
      (closedCountChanged && closedBarCount > prevClosedCountRef.current ||
        (displaySeriesData.length >= 2 &&
          displaySeriesData.length > prevSeriesLengthRef.current + 1));
    const canIncrementalUpdate =
      !closedCountChanged &&
      !historyExpanded &&
      sameLength &&
      lastTime !== null &&
      lastTime === prevLastBarTimeRef.current;
    const visibleBars = isMobile ? 40 : 60;

    const applyDefaultViewport = () => {
      const defaultRange = defaultVisibleRange(displaySeriesData.length, visibleBars);
      if (defaultRange && displaySeriesData.length >= 2) {
        chart.timeScale().setVisibleLogicalRange(defaultRange);
        initialRangeRef.current = defaultRange;
      } else {
        chart.timeScale().fitContent();
        const range = chart.timeScale().getVisibleLogicalRange();
        if (range) {
          initialRangeRef.current = range;
        }
      }
    };

    if (
      !userHasPannedRef.current &&
      (isContextChange || !savedRange || historyExpanded)
    ) {
      series.setData(displaySeriesData);
      applyDefaultViewport();
    } else if (userHasPannedRef.current && savedRange) {
      series.setData(displaySeriesData);
      chart.timeScale().setVisibleLogicalRange(savedRange);
    } else if (canIncrementalUpdate) {
      const seriesLastTime = chartTimeToUnix(series.data().at(-1)?.time);
      const pointTime = chartTimeToUnix(last.time);
      if (canUpdateSeriesLastBar(seriesLastTime, pointTime)) {
        series.update(last);
      } else {
        series.setData(displaySeriesData);
        if (savedRange && !historyExpanded) {
          chart.timeScale().setVisibleLogicalRange(savedRange);
        }
      }
    } else {
      series.setData(displaySeriesData);
      if (savedRange && !historyExpanded) {
        chart.timeScale().setVisibleLogicalRange(savedRange);
      } else if (!userHasPannedRef.current) {
        applyDefaultViewport();
      }
    }

    prevSeriesLengthRef.current = displaySeriesData.length;
    prevClosedCountRef.current = closedBarCount;
    prevLastBarTimeRef.current = lastTime;
    void contextKey;
  }, [closedBarCount, displaySeriesData, isMobile]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) {
      return;
    }

    if (priceLineRef.current) {
      series.removePriceLine(priceLineRef.current);
      priceLineRef.current = null;
    }

    const price = livePrice ?? displaySeriesData.at(-1)?.close;
    if (typeof price !== "number") {
      return;
    }

    priceLineRef.current = series.createPriceLine({
      price,
      color: LIVE_LINE_COLOR,
      lineWidth: 2,
      lineStyle: LineStyle.Solid,
      axisLabelVisible: true,
      title: "Live",
    });
  }, [displaySeriesData, livePrice]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) {
      return;
    }

    for (const line of alertLinesRef.current.values()) {
      series.removePriceLine(line);
    }
    alertLinesRef.current.clear();

    for (const alert of pairAlerts) {
      const price = alertPrice(alert);
      if (price === null) {
        continue;
      }

      const line = series.createPriceLine({
        price,
        color: alert.condition === "below" ? "#f87171" : "#4ade80",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: false,
        title: `${alert.condition ?? "alert"}`,
      });
      alertLinesRef.current.set(alert.id, line);
    }
  }, [pairAlerts]);

  const isInitialLoading = ohlcLoading && !ohlcData;
  const error = ohlcError;
  const showOverlaySkeleton = isInitialLoading && seriesData.length === 0;
  const showEmpty = !isInitialLoading && !error && seriesData.length === 0;
  const chartHeight = isMobile ? Math.max(height, 320) : height;

  const toolbarButtonClass = cn(
    isMobile && "h-11 min-w-[4.5rem] active:scale-95",
  );

  return (
    <Card className={className}>
      <CardHeader className="flex flex-col gap-3 space-y-0 pb-2 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <span>
            {pair.replace("/", "").toUpperCase()} · {interval}
          </span>
          {formingCandle?.is_forming ? (
            <span
              className={cn(
                "rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-normal text-destructive",
                formingPulse && "animate-pulse",
              )}
            >
              Forming
              {typeof formingCandle.progress_percent === "number"
                ? ` · ${Math.round(formingCandle.progress_percent)}%`
                : ""}
            </span>
          ) : null}
          {isRefreshing ? (
            <span className="text-xs font-normal text-muted-foreground">Updating…</span>
          ) : null}
        </CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={resetFlash ? "default" : "outline"}
            className={toolbarButtonClass}
            onClick={resetView}
          >
            Reset
          </Button>
          <Button
            type="button"
            size="sm"
            variant={latestFlash ? "default" : "outline"}
            className={toolbarButtonClass}
            onClick={scrollToLatest}
          >
            Latest
          </Button>
          <Select value={interval} onValueChange={(value) => setInterval(value as ChartInterval)}>
            <SelectTrigger
              className={cn("h-8 w-[88px]", isMobile && "h-11")}
              aria-label="Candle interval"
            >
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
        </div>
      </CardHeader>
      <CardContent className={cn(isMobile && "px-2 sm:px-4")}>
        {error ? (
          <p className="text-sm text-destructive" style={{ minHeight: chartHeight }}>
            Could not load chart data.
          </p>
        ) : null}
        {showEmpty ? (
          <p className="flex items-center text-sm text-muted-foreground" style={{ minHeight: chartHeight }}>
            No candle data yet.
          </p>
        ) : null}
        <div className="relative overflow-visible">
          {isMobile && hoverPrice !== null ? (
            <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md border bg-muted/50 px-3 py-1.5 text-xs font-mono">
              <span>Price: {hoverPrice.toFixed(5)}</span>
              {hoverTimeLabel ? <span className="text-muted-foreground">{hoverTimeLabel}</span> : null}
            </div>
          ) : null}
          <div
            ref={containerRef}
            className={cn(
              "w-full touch-none",
              (showEmpty || error) && "hidden",
            )}
            style={{ height: chartHeight, minHeight: isMobile ? 320 : undefined }}
            aria-hidden={showEmpty || !!error}
          />
          {showOverlaySkeleton ? (
            <Skeleton
              className="absolute inset-0 z-10 w-full rounded-md opacity-80"
              style={{ height: chartHeight }}
            />
          ) : null}
          {onCreateAlert ? (
            <>
              {hoverY !== null && hoverPrice !== null && !clickPopover ? (
                <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="absolute left-1 z-20 flex h-9 w-9 items-center justify-center rounded-full border bg-card text-primary shadow-md transition active:scale-[0.97] sm:h-7 sm:w-7"
                      style={{ top: hoverY - 18 }}
                      onClick={() => setPopoverOpen(true)}
                      aria-label="Create alert at hovered price"
                    >
                      <PlusIcon className="h-4 w-4" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-48 p-2">
                    <div className="grid gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="justify-start"
                        onClick={() => {
                          setClickPopover(null);
                          openAlertDraft("price", hoverPrice);
                        }}
                      >
                        Price alert
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="justify-start"
                        onClick={() => {
                          setClickPopover(null);
                          openAlertDraft("candle_close", hoverPrice);
                        }}
                      >
                        Candle close alert
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              ) : null}
              {clickPopover ? (
                <Popover
                  open={popoverOpen}
                  onOpenChange={(open) => {
                    setPopoverOpen(open);
                    if (!open) {
                      setClickPopover(null);
                    }
                  }}
                >
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="absolute left-1 z-20 h-1 w-1 opacity-0"
                      style={{ top: clickPopover.y - 1 }}
                      aria-hidden
                    />
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-48 p-2">
                    <div className="grid gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="justify-start"
                        onClick={() => {
                          setClickPopover(null);
                          setPopoverOpen(false);
                          openAlertDraft("price", clickPopover.price);
                        }}
                      >
                        Price alert
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="justify-start"
                        onClick={() => {
                          setClickPopover(null);
                          setPopoverOpen(false);
                          openAlertDraft("candle_close", clickPopover.price);
                        }}
                      >
                        Candle close alert
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              ) : null}
            </>
          ) : null}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {isMobile
            ? "Red line is live price. Tap the forming candle or use + to create an alert."
            : "Red line is live price. Click the chart or use + to create a price or candle alert."}
        </p>
      </CardContent>
    </Card>
  );
}
