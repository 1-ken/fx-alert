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
  candlesToSeriesData,
  CHART_INTERVAL_OPTIONS,
  getChartScaleOptions,
  getChartTheme,
  mergeFormingCandle,
  type ChartInterval,
} from "@/lib/chart-utils";
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

const FAST_OHLC_LIMIT = 80;
const DRAG_THRESHOLD_PX = 4;

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
  const pairAlertsRef = useRef<Alert[]>([]);
  const updateAlertRef = useRef<
    (id: string, input: Partial<{ target_price: number }>, options?: { silent?: boolean }) => Promise<unknown>
  >(() => Promise.resolve(null));
  const draggingAlertRef = useRef<{ alertId: string; startPrice: number } | null>(null);
  const dragCandidateRef = useRef<{
    alertId: string;
    startPrice: number;
    startY: number;
    pointerId: number;
  } | null>(null);
  const didDragAlertRef = useRef(false);
  const isMobileRef = useRef(false);
  const openAlertDraftRef = useRef<
    (alertType: "price" | "candle_close", price: number, candleTime?: string) => void
  >(() => undefined);

  const [interval, setInterval] = useState<ChartInterval>(intervalProp);
  const [hoverY, setHoverY] = useState<number | null>(null);
  const [hoverPrice, setHoverPrice] = useState<number | null>(null);
  const [hoverTimeLabel, setHoverTimeLabel] = useState<string | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [resetFlash, setResetFlash] = useState(false);
  const [latestFlash, setLatestFlash] = useState(false);

  const isMobile = useIsMobile();
  isMobileRef.current = isMobile;

  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const { alerts, updateAlert } = useObserverAlerts();
  updateAlertRef.current = updateAlert;

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
  pairAlertsRef.current = pairAlerts;

  const ohlcParams = useMemo(() => ({ pair, interval, limit }), [pair, interval, limit]);
  const fastOhlcParams = useMemo(
    () => ({ pair, interval, limit: Math.min(limit, FAST_OHLC_LIMIT) }),
    [pair, interval, limit],
  );

  const { data: closedData, isInitialLoading: closedLoading, error: closedError } =
    useHistoricalOhlc(fastOhlcParams);
  const {
    data: formingData,
    isInitialLoading: formingLoading,
    isRefreshing,
    error: formingError,
  } = useHistoricalOhlcWithForming(ohlcParams, { mobileRefresh: isMobile });

  const seriesData = useMemo(() => {
    const closed = closedData?.candles?.length
      ? closedData.candles
      : (formingData?.candles?.filter((c) => !c.is_forming) ?? []);
    const forming = formingData?.forming_candle ?? null;
    const merged = mergeFormingCandle(closed, forming);
    return candlesToSeriesData(merged);
  }, [closedData, formingData]);

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
    if (dataLength > 0) {
      const visibleBars = isMobile ? 40 : 60;
      const from = Math.max(0, dataLength - visibleBars);
      chart.timeScale().setVisibleLogicalRange({ from, to: dataLength });
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
  openAlertDraftRef.current = openAlertDraft;

  useEffect(() => {
    setInterval(intervalProp);
  }, [intervalProp]);

  useEffect(() => {
    dataContextRef.current = `${pair}|${interval}`;
    userHasPannedRef.current = false;
    prevSeriesLengthRef.current = 0;
    initialRangeRef.current = null;
  }, [pair, interval]);

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
      if (didDragAlertRef.current) {
        didDragAlertRef.current = false;
        return;
      }

      if (isMobileRef.current) {
        return;
      }

      if (!param.point || !param.time) {
        return;
      }

      const price = series.coordinateToPrice(param.point.y);
      if (typeof price !== "number") {
        return;
      }

      const candleTime =
        typeof param.time === "number"
          ? new Date(param.time * 1000).toISOString()
          : undefined;

      openAlertDraftRef.current("candle_close", price, candleTime);
    });

    return () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(markUserPanned);
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      priceLineRef.current = null;
      alertLinesRef.current.clear();
    };
  }, [height, scaleOptions, theme]);

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

    if (seriesData.length === 0) {
      series.setData([]);
      prevSeriesLengthRef.current = 0;
      return;
    }

    const contextKey = dataContextRef.current;
    const isContextChange = prevSeriesLengthRef.current === 0 && !initialRangeRef.current;
    const savedRange = chart.timeScale().getVisibleLogicalRange();
    const sameLength = seriesData.length === prevSeriesLengthRef.current;

    if (!userHasPannedRef.current && (isContextChange || !savedRange)) {
      series.setData(seriesData);
      chart.timeScale().fitContent();
      const range = chart.timeScale().getVisibleLogicalRange();
      if (range) {
        initialRangeRef.current = range;
      }
    } else if (userHasPannedRef.current && savedRange) {
      series.setData(seriesData);
      chart.timeScale().setVisibleLogicalRange(savedRange);
    } else if (sameLength && seriesData.length > 0) {
      const last = seriesData[seriesData.length - 1];
      series.update(last);
    } else {
      series.setData(seriesData);
      if (savedRange) {
        chart.timeScale().setVisibleLogicalRange(savedRange);
      }
    }

    prevSeriesLengthRef.current = seriesData.length;
    void contextKey;
  }, [seriesData]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) {
      return;
    }

    if (priceLineRef.current) {
      series.removePriceLine(priceLineRef.current);
      priceLineRef.current = null;
    }

    const price = livePrice ?? seriesData.at(-1)?.close;
    if (typeof price !== "number") {
      return;
    }

    priceLineRef.current = series.createPriceLine({
      price,
      color: isDark ? "#38bdf8" : "#0284c7",
      lineWidth: 2,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: "Live",
    });
  }, [isDark, livePrice, seriesData]);

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
        color: alert.condition === "below" ? "#ef4444" : "#22c55e",
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        title: `${alert.condition ?? "alert"}`,
      });
      alertLinesRef.current.set(alert.id, line);
    }
  }, [pairAlerts]);

  useEffect(() => {
    const container = containerRef.current;
    const series = seriesRef.current;
    if (!container || !series) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const y = event.clientY - rect.top;
      const price = series.coordinateToPrice(y);
      if (typeof price !== "number") {
        return;
      }

      const nearest = pairAlertsRef.current.find((alert) => {
        const alertPx = series.priceToCoordinate(alert.target_price ?? 0);
        return typeof alertPx === "number" && Math.abs(alertPx - y) < 12;
      });

      if (!nearest || nearest.target_price === null) {
        return;
      }

      dragCandidateRef.current = {
        alertId: nearest.id,
        startPrice: nearest.target_price,
        startY: y,
        pointerId: event.pointerId,
      };
    };

    const onPointerMove = (event: PointerEvent) => {
      const candidate = dragCandidateRef.current;

      if (!draggingAlertRef.current && candidate) {
        const rect = container.getBoundingClientRect();
        const y = event.clientY - rect.top;
        if (Math.abs(y - candidate.startY) < DRAG_THRESHOLD_PX) {
          return;
        }

        draggingAlertRef.current = {
          alertId: candidate.alertId,
          startPrice: candidate.startPrice,
        };
        didDragAlertRef.current = true;
        dragCandidateRef.current = null;

        try {
          container.setPointerCapture(candidate.pointerId);
        } catch {
          // Ignore capture failures.
        }
      }

      if (!draggingAlertRef.current) {
        return;
      }

      const rect = container.getBoundingClientRect();
      const y = event.clientY - rect.top;
      const price = series.coordinateToPrice(y);
      if (typeof price !== "number") {
        return;
      }

      const line = alertLinesRef.current.get(draggingAlertRef.current.alertId);
      if (line) {
        line.applyOptions({ price });
      }
    };

    const onPointerUp = (event: PointerEvent) => {
      dragCandidateRef.current = null;

      if (!draggingAlertRef.current) {
        return;
      }

      const rect = container.getBoundingClientRect();
      const y = event.clientY - rect.top;
      const price = series.coordinateToPrice(y);
      const dragState = draggingAlertRef.current;
      draggingAlertRef.current = null;

      if (typeof price === "number" && Math.abs(price - dragState.startPrice) > 0.00001) {
        void updateAlertRef.current(dragState.alertId, { target_price: price }, { silent: true });
      }

      try {
        container.releasePointerCapture(event.pointerId);
      } catch {
        // Pointer may already be released.
      }
    };

    container.addEventListener("pointerdown", onPointerDown);
    container.addEventListener("pointermove", onPointerMove);
    container.addEventListener("pointerup", onPointerUp);
    container.addEventListener("pointercancel", onPointerUp);

    return () => {
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerup", onPointerUp);
      container.removeEventListener("pointercancel", onPointerUp);
    };
  }, []);

  const isInitialLoading = closedLoading && formingLoading && !closedData && !formingData;
  const error = closedError ?? formingError;
  const showOverlaySkeleton = isInitialLoading && seriesData.length === 0;
  const showEmpty = !isInitialLoading && !error && seriesData.length === 0;
  const chartHeight = isMobile ? Math.max(height, 320) : height;

  const toolbarButtonClass = cn(
    isMobile && "h-11 min-w-[4.5rem] active:scale-95",
  );

  return (
    <Card className={className}>
      <CardHeader className="flex flex-col gap-3 space-y-0 pb-2 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="text-base">
          {pair.replace("/", "").toUpperCase()} · {interval}
          {isRefreshing ? (
            <span className="ml-2 text-xs font-normal text-muted-foreground">Updating…</span>
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
          {hoverY !== null && hoverPrice !== null && onCreateAlert ? (
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
                    onClick={() => openAlertDraft("price", hoverPrice)}
                  >
                    Price alert
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="justify-start"
                    onClick={() => openAlertDraft("candle_close", hoverPrice)}
                  >
                    Candle close alert
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          ) : null}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {isMobile
            ? "Drag alert lines to adjust price. Use + on the chart to create an alert."
            : "Drag alert lines to adjust price. Click a candle or use + on the left to create an alert."}
        </p>
      </CardContent>
    </Card>
  );
}
