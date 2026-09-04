"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import {
  dispose,
  init,
  type ActionCallback,
  type Chart,
  type Crosshair,
  type KLineData,
} from "klinecharts";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useChartFormingStream } from "@/hooks/chart/use-chart-forming-stream";
import {
  chartClosedOhlcKey,
  useHistoricalOhlc,
  useHistoricalOhlcWithForming,
} from "@/hooks/historical/use-historical";
import { useObserverAlerts } from "@/hooks/alerts/use-alerts";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  applyLivePriceToForming,
  CHART_INTERVAL_OPTIONS,
  extractFormingCandle,
  pickClosedBase,
  resolveClosedCandles,
  synthesizeFormingFromLive,
  type ChartInterval,
} from "@/lib/chart-utils";
import {
  applyChartLayout,
  captureChartLayout,
  chartIntervalToPeriod,
  getKLineChartStyles,
  KLINE_CHART_TYPE_OPTIONS,
  KLINE_DRAWING_OPTIONS,
  KLINE_INDICATOR_OPTIONS,
  loadChartLayout,
  mergedKLineData,
  ohlcToKLineData,
  priceFromChartCoordinate,
  saveChartLayout,
  syncAlertOverlays,
  syncDrawHistory,
  syncLivePriceOverlay,
  syncPrevDayLevels,
  type ChartLayoutSnapshot,
  type KLineChartType,
} from "@/lib/klinechart-utils";
import { useDrawOnLiquidity } from "@/hooks/historical/use-draw-on-liquidity";
import { biasLabel, drawLabel } from "@/lib/draw-on-liquidity";
import type { OhlcCandle } from "@/types/historical";
import { cn } from "@/lib/utils";
import { PlusIcon } from "@heroicons/react/24/outline";
import {
  ChartBarIcon,
  PencilSquareIcon,
  Squares2X2Icon,
} from "@heroicons/react/24/outline";

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
  /** Show previous-day-high/low levels + daily bias badge (default true). */
  showDrawOnLiquidity?: boolean;
  /** Show per-day PDH/PDL history segments across the chart (default false). */
  showDrawHistory?: boolean;
};

function normalizePairKey(pair: string): string {
  return pair.replace(/[^a-z0-9]/gi, "").toUpperCase();
}

function hapticTap(): void {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(10);
  }
}

function pushFormingBar(
  callback: ((data: KLineData) => void) | null,
  forming: OhlcCandle | null | undefined,
): void {
  if (!callback || !forming) {
    return;
  }
  callback(ohlcToKLineData(forming));
}

/**
 * KLineChart trading chart with live forming bar, alert lines, and trader toolbar.
 */
export function InteractiveTradingChart({
  pair,
  livePrice,
  interval: intervalProp = "5m",
  limit = 120,
  height = 380,
  onCreateAlert,
  className,
  showDrawOnLiquidity = true,
  showDrawHistory = false,
}: InteractiveTradingChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const subscribeBarRef = useRef<((data: KLineData) => void) | null>(null);
  const closedCandlesRef = useRef<OhlcCandle[]>([]);
  const formingCandleRef = useRef<OhlcCandle | null>(null);
  const userHasPannedRef = useRef(false);
  const activeIndicatorsRef = useRef<Set<string>>(new Set());
  const pendingLayoutRef = useRef<ChartLayoutSnapshot | null>(null);
  const prevClosedCountRef = useRef(0);
  const prevLastClosedTsRef = useRef<string | null>(null);
  const prevPairIntervalRef = useRef({ pair, interval: intervalProp });
  const isDarkRef = useRef(false);
  const pairRef = useRef(pair);
  const intervalRef = useRef(intervalProp);
  const openAlertDraftRef = useRef<
    (alertType: "price" | "candle_close", price: number, candleTime?: string) => void
  >(() => undefined);
  const isMobileRef = useRef(false);
  const persistLayoutRef = useRef<() => void>(() => undefined);

  const [interval, setInterval] = useState<ChartInterval>(intervalProp);
  const [chartType, setChartType] = useState<KLineChartType>("candle_solid");
  const [hoverY, setHoverY] = useState<number | null>(null);
  const [hoverPrice, setHoverPrice] = useState<number | null>(null);
  const [hoverTimeLabel, setHoverTimeLabel] = useState<string | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [clickPopover, setClickPopover] = useState<{
    y: number;
    price: number;
  } | null>(null);
  const [resetFlash, setResetFlash] = useState(false);
  const [latestFlash, setLatestFlash] = useState(false);
  const [cachedClosed, setCachedClosed] = useState<OhlcCandle[]>([]);
  const [dataReady, setDataReady] = useState(false);
  const [activeIndicators, setActiveIndicators] = useState<Set<string>>(() => new Set());

  pairRef.current = pair;
  intervalRef.current = interval;

  const isMobile = useIsMobile();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  isDarkRef.current = isDark;
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
  const closedOhlcKey = useMemo(() => chartClosedOhlcKey(ohlcParams), [ohlcParams]);

  const {
    data: ohlcData,
    isInitialLoading: ohlcLoading,
    error: ohlcError,
  } = useHistoricalOhlc(ohlcParams, { chartClosed: true });

  const { data: formingOhlcData } = useHistoricalOhlcWithForming(ohlcParams);

  const {
    formingCandle: formingCandleWs,
    livePrice: streamLivePrice,
    status: formingStreamStatus,
  } = useChartFormingStream(pair, interval, { closedOhlcKey });

  const closedFromHttp = useMemo(
    () => ohlcData?.candles?.filter((c) => !c.is_forming) ?? [],
    [ohlcData],
  );

  const needsClosedFallback = closedFromHttp.length === 0;

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
    () => pickClosedBase(cachedClosed.length > 0 ? cachedClosed : closedFromHttp, fallbackClosed),
    [cachedClosed, closedFromHttp, fallbackClosed],
  );

  const closedForChart = useMemo(
    () => resolveClosedCandles(ohlcData, closedBase),
    [ohlcData, closedBase],
  );

  const displayLivePrice = streamLivePrice ?? livePrice;

  const formingCandle = useMemo(() => {
    const base =
      formingCandleWs ??
      extractFormingCandle(formingOhlcData) ??
      synthesizeFormingFromLive(displayLivePrice, closedForChart, interval);
    return applyLivePriceToForming(base, displayLivePrice, closedForChart);
  }, [
    formingCandleWs,
    formingOhlcData,
    displayLivePrice,
    closedForChart,
    interval,
  ]);

  const resetChartWithLayout = useCallback((chart: Chart) => {
    const chartInstance = chartRef.current ?? chart;
    pendingLayoutRef.current = captureChartLayout(
      chartInstance,
      activeIndicatorsRef.current,
    );
    chartInstance.resetData();
  }, []);

  const persistLayout = useCallback(() => {
    const chart = chartRef.current;
    if (!chart) {
      return;
    }
    const layout = captureChartLayout(chart, activeIndicatorsRef.current);
    saveChartLayout(pairRef.current, intervalRef.current, layout);
  }, []);

  useEffect(() => {
    persistLayoutRef.current = persistLayout;
  }, [persistLayout]);

  useEffect(() => {
    closedCandlesRef.current = closedForChart;
  }, [closedForChart]);

  useEffect(() => {
    formingCandleRef.current = formingCandle;
  }, [formingCandle]);

  useEffect(() => {
    if (closedFromHttp.length > 0) {
      setCachedClosed((prev) => {
        const unchanged =
          prev.length === closedFromHttp.length &&
          prev.length > 0 &&
          prev[prev.length - 1]?.timestamp ===
            closedFromHttp[closedFromHttp.length - 1]?.timestamp;
        return unchanged ? prev : closedFromHttp;
      });
    }
  }, [closedFromHttp]);

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
    chart.scrollToRealTime(200);
    flashButton("reset");
    toast.message("Chart view reset");
  }, [flashButton]);

  const scrollToLatest = useCallback(() => {
    const chart = chartRef.current;
    if (!chart) {
      return;
    }
    chart.scrollToRealTime(200);
    flashButton("latest");
    toast.message("Showing latest candles");
  }, [flashButton]);

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

  const handleCrosshairChange = useCallback<ActionCallback>((data) => {
    const crosshair = data as Crosshair;
    const chart = chartRef.current;
    if (!chart || crosshair.x === undefined || crosshair.y === undefined) {
      setHoverY(null);
      setHoverPrice(null);
      setHoverTimeLabel(null);
      return;
    }

    setHoverY(crosshair.y);
    const price = priceFromChartCoordinate(chart, crosshair.x, crosshair.y);
    setHoverPrice(price);

    if (crosshair.timestamp) {
      setHoverTimeLabel(new Date(crosshair.timestamp).toLocaleString());
    } else if (crosshair.kLineData?.timestamp) {
      setHoverTimeLabel(new Date(crosshair.kLineData.timestamp).toLocaleString());
    } else {
      setHoverTimeLabel(null);
    }
  }, []);

  const handleChartClick = useCallback(
    (event: MouseEvent) => {
      if (!onCreateAlert) {
        return;
      }
      const chart = chartRef.current;
      const container = containerRef.current;
      if (!chart || !container) {
        return;
      }

      const rect = container.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const price = priceFromChartCoordinate(chart, x, y);
      if (price === null) {
        return;
      }

      if (isMobileRef.current) {
        const dataList = chart.getDataList();
        const last = dataList.at(-1);
        if (last && crosshairMatchesLastBar(event, chart, last)) {
          openAlertDraftRef.current("candle_close", price);
        }
        return;
      }

      setClickPopover({ y, price });
      setPopoverOpen(true);
    },
    [onCreateAlert],
  );

  const syncActiveIndicatorsState = useCallback((names: Iterable<string>) => {
    const next = new Set(names);
    activeIndicatorsRef.current = next;
    setActiveIndicators(next);
  }, []);

  const applyPendingLayout = useCallback((chart: Chart) => {
    const pending = pendingLayoutRef.current;
    if (pending) {
      applyChartLayout(chart, pending);
      syncActiveIndicatorsState(pending.indicators);
      pendingLayoutRef.current = null;
      persistLayoutRef.current();
      return;
    }
    const stored = loadChartLayout(pairRef.current, intervalRef.current);
    if (stored) {
      applyChartLayout(chart, stored);
      syncActiveIndicatorsState(stored.indicators);
    }
  }, [syncActiveIndicatorsState]);

  useEffect(() => {
    isMobileRef.current = isMobile;
  }, [isMobile]);

  useEffect(() => {
    openAlertDraftRef.current = openAlertDraft;
  }, [openAlertDraft]);

  useEffect(() => {
    setInterval(intervalProp);
  }, [intervalProp]);

  useEffect(() => {
    userHasPannedRef.current = false;
    setCachedClosed([]);
    setDataReady(false);
    subscribeBarRef.current = null;
    prevClosedCountRef.current = 0;
    prevLastClosedTsRef.current = null;
  }, [pair, interval]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const chart = init(container, {
      styles: getKLineChartStyles(isDarkRef.current),
    });
    if (!chart) {
      return;
    }
    chartRef.current = chart;

    chart.setSymbol({
      ticker: pairRef.current,
      pricePrecision: 5,
      volumePrecision: 0,
    });
    chart.setPeriod(chartIntervalToPeriod(intervalRef.current));

    const onVisibleRangeChange = () => {
      userHasPannedRef.current = true;
    };

    chart.subscribeAction("onCrosshairChange", handleCrosshairChange);
    chart.subscribeAction("onVisibleRangeChange", onVisibleRangeChange);
    container.addEventListener("click", handleChartClick);

    chart.setDataLoader({
      getBars: ({ type, callback }) => {
        if (type !== "init" && type !== "update") {
          callback([], { backward: false, forward: false });
          return;
        }
        const bars = mergedKLineData(
          closedCandlesRef.current,
          formingCandleRef.current,
        );
        callback(bars, { backward: false, forward: false });
        setDataReady(bars.length > 0);
        applyPendingLayout(chart);
        pushFormingBar(subscribeBarRef.current, formingCandleRef.current);
      },
      subscribeBar: ({ callback }) => {
        subscribeBarRef.current = callback;
        pushFormingBar(callback, formingCandleRef.current);
      },
      unsubscribeBar: () => {
        subscribeBarRef.current = null;
      },
    });

    applyPendingLayout(chart);

    const resizeObserver = new ResizeObserver(() => {
      chart.resize();
    });
    resizeObserver.observe(container);

    return () => {
      persistLayoutRef.current();
      resizeObserver.disconnect();
      container.removeEventListener("click", handleChartClick);
      chart.unsubscribeAction("onCrosshairChange", handleCrosshairChange);
      chart.unsubscribeAction("onVisibleRangeChange", onVisibleRangeChange);
      dispose(chart);
      chartRef.current = null;
      subscribeBarRef.current = null;
    };
  }, [applyPendingLayout, handleChartClick, handleCrosshairChange]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) {
      return;
    }
    chart.setStyles(getKLineChartStyles(isDark));
  }, [isDark]);

  useEffect(() => {
    const chart = chartRef.current;
    const prev = prevPairIntervalRef.current;
    const changed = prev.pair !== pair || prev.interval !== interval;

    if (changed && chart) {
      const layout = captureChartLayout(chart, activeIndicatorsRef.current);
      saveChartLayout(prev.pair, prev.interval, layout);
    }

    if (changed) {
      const stored = loadChartLayout(pair, interval);
      pendingLayoutRef.current = stored;
      syncActiveIndicatorsState(stored?.indicators ?? []);

      if (chart) {
        chart.setSymbol({ ticker: pair, pricePrecision: 5, volumePrecision: 0 });
        chart.setPeriod(chartIntervalToPeriod(interval));
      }
    }

    prevPairIntervalRef.current = { pair, interval };
  }, [interval, pair, syncActiveIndicatorsState]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) {
      return;
    }
    chart.setStyles({
      candle: { type: chartType },
    });
  }, [chartType]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || closedForChart.length === 0) {
      return;
    }

    const prevCount = prevClosedCountRef.current;
    const prevLastTs = prevLastClosedTsRef.current;
    const newCount = closedForChart.length;
    const newLastTs = closedForChart.at(-1)?.timestamp ?? null;

    const barClosed =
      prevCount > 0 && newCount > prevCount && newLastTs !== prevLastTs;

    prevClosedCountRef.current = newCount;
    prevLastClosedTsRef.current = newLastTs;

    if (barClosed) {
      resetChartWithLayout(chart);
      return;
    }

    if (prevCount === 0 && newCount > 0) {
      pushFormingBar(subscribeBarRef.current, formingCandleRef.current);
    }
  }, [closedForChart, resetChartWithLayout]);

  useEffect(() => {
    pushFormingBar(subscribeBarRef.current, formingCandle);
  }, [formingCandle]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) {
      return;
    }
    syncAlertOverlays(chart, pairAlerts);
  }, [pairAlerts]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) {
      return;
    }
    syncLivePriceOverlay(chart, displayLivePrice);
  }, [displayLivePrice]);

  const { live: drawLive, biasSeries: drawBiasSeries } = useDrawOnLiquidity(
    showDrawOnLiquidity ? pair : "",
    displayLivePrice,
  );

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) {
      return;
    }
    if (!showDrawOnLiquidity || !drawLive) {
      syncPrevDayLevels(chart, null);
      return;
    }
    syncPrevDayLevels(chart, {
      pdh: drawLive.pdh,
      pdl: drawLive.pdl,
      draw: drawLive.draw,
    });
    // Re-apply after bar-close resets (closedForChart change clears overlays).
  }, [showDrawOnLiquidity, drawLive, closedForChart]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) {
      return;
    }
    if (showDrawOnLiquidity && showDrawHistory) {
      syncDrawHistory(chart, drawBiasSeries);
    } else {
      syncDrawHistory(chart, []);
    }
  }, [showDrawOnLiquidity, showDrawHistory, drawBiasSeries, closedForChart]);

  const toggleIndicator = useCallback((name: string) => {
    const chart = chartRef.current;
    if (!chart) {
      return;
    }
    const active = new Set(activeIndicatorsRef.current);
    if (active.has(name)) {
      chart.removeIndicator({ name });
      active.delete(name);
    } else {
      const isStack = name === "MA" || name === "EMA" || name === "BOLL";
      chart.createIndicator(name, {
        isStack,
        pane: isStack ? { id: "candle_pane" } : undefined,
      });
      active.add(name);
    }
    syncActiveIndicatorsState(active);
    persistLayoutRef.current();
  }, [syncActiveIndicatorsState]);

  const startDrawing = useCallback((overlayName: string) => {
    const chart = chartRef.current;
    if (!chart) {
      return;
    }
    chart.createOverlay(overlayName);
    window.setTimeout(() => {
      const layout = captureChartLayout(chart, activeIndicatorsRef.current);
      saveChartLayout(pairRef.current, intervalRef.current, layout);
    }, 500);
  }, []);

  const isInitialLoading = ohlcLoading && !ohlcData;
  const error = ohlcError;
  const showOverlaySkeleton = isInitialLoading && !dataReady;
  const showEmpty = !isInitialLoading && !error && closedForChart.length === 0 && !formingCandle;
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
            <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-normal text-destructive">
              Forming
              {typeof formingCandle.progress_percent === "number"
                ? ` · ${Math.round(formingCandle.progress_percent)}%`
                : ""}
            </span>
          ) : null}
          {formingStreamStatus === "live" ? (
            <span className="text-xs font-normal text-muted-foreground">Live</span>
          ) : formingStreamStatus === "connecting" ? (
            <span className="text-xs font-normal text-muted-foreground">Connecting…</span>
          ) : null}
          {showDrawOnLiquidity && drawLive ? (
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-normal",
                drawLive.bias === "bullish"
                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                  : drawLive.bias === "bearish"
                    ? "bg-red-500/15 text-red-600 dark:text-red-400"
                    : "bg-muted text-muted-foreground",
              )}
              title="Daily bias from previous-day high/low"
            >
              {biasLabel(drawLive.bias)}
              {drawLive.draw !== "none"
                ? ` · Draw ${drawLabel(drawLive.draw)} ${
                    drawLive.drawTargetPrice?.toFixed(5) ?? ""
                  }${drawLive.drawReached ? " ✓" : ""}`
                : ""}
            </span>
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
        <div className="flex gap-2">
          <div className="flex shrink-0 flex-col gap-1 pt-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" size="icon" variant="outline" className="h-8 w-8" aria-label="Chart type">
                  <ChartBarIcon className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel>Chart type</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {KLINE_CHART_TYPE_OPTIONS.map((opt) => (
                  <DropdownMenuItem
                    key={opt.value}
                    onClick={() => setChartType(opt.value)}
                    className={chartType === opt.value ? "bg-accent" : undefined}
                  >
                    {opt.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" size="icon" variant="outline" className="h-8 w-8" aria-label="Indicators">
                  <Squares2X2Icon className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel>Indicators</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {KLINE_INDICATOR_OPTIONS.map((opt) => (
                  <DropdownMenuItem
                    key={opt.value}
                    onClick={() => toggleIndicator(opt.value)}
                    className={activeIndicators.has(opt.value) ? "bg-accent" : undefined}
                  >
                    {opt.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" size="icon" variant="outline" className="h-8 w-8" aria-label="Drawing tools">
                  <PencilSquareIcon className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel>Drawing tools</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {KLINE_DRAWING_OPTIONS.map((opt) => (
                  <DropdownMenuItem key={opt.value} onClick={() => startDrawing(opt.value)}>
                    {opt.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="relative min-w-0 flex-1 overflow-visible">
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

function crosshairMatchesLastBar(
  event: MouseEvent,
  chart: Chart,
  lastBar: KLineData,
): boolean {
  const container = chart.getDom();
  if (!container) {
    return false;
  }
  const rect = container.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const coords = chart.convertToPixel([{ timestamp: lastBar.timestamp }]);
  const point = Array.isArray(coords) ? coords[0] : coords;
  if (!point || typeof point.x !== "number") {
    return false;
  }
  return Math.abs(point.x - x) < 24;
}
