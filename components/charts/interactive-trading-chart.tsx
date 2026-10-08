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
  chartFormingOhlcKey,
  useHistoricalOhlcWithForming,
} from "@/hooks/historical/use-historical";
import { useObserverAlerts } from "@/hooks/alerts/use-alerts";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  applyLivePriceToForming,
  CHART_INTERVAL_OPTIONS,
  chartIntervalToSeconds,
  closedCandlesContentEqual,
  extractFormingCandle,
  resolveClosedCandles,
  synthesizeFormingFromLive,
  type ChartInterval,
} from "@/lib/chart-utils";
import {
  applyChartLayout,
  captureChartLayout,
  chartIntervalToPeriod,
  getKLineChartStyles,
  isSystemOverlayId,
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
  syncPrevDayLevels,
  syncTriggerFocusOverlay,
  type ChartLayoutSnapshot,
  type KLineChartType,
} from "@/lib/klinechart-utils";
import { useDrawOnLiquidity } from "@/hooks/historical/use-draw-on-liquidity";
import { biasLabel, drawLabel } from "@/lib/draw-on-liquidity";
import type { OhlcCandle } from "@/types/historical";
import { cn } from "@/lib/utils";
import { computeMarketStructure, structureEventKey, type StructureEvent } from "@/lib/market-structure";
import {
  DEFAULT_STRUCTURE_LAYERS,
  syncMarketStructureOverlays,
  syncPendingStructureAlertOverlays,
  type StructureLayerFlags,
} from "@/lib/structure-overlay";
import { Checkbox } from "@/components/ui/checkbox";
import { useChartPrefsStore } from "@/stores/chart-prefs-store";
import {
  ChartBarIcon,
  PencilSquareIcon,
  PlusIcon,
  Squares2X2Icon,
} from "@heroicons/react/24/outline";

export type ChartAlertDraft = {
  pair: string;
  alertType: "price" | "candle_close" | "market_structure";
  price: number;
  interval: ChartInterval;
  candleTime?: string;
  structureEvent?: "bos" | "choch" | "sweep";
  structureDirection?: "bull" | "bear" | "any";
};

export type ChartTriggerFocus = {
  /** Candle open, or the trigger timestamp when no candle time was stored. */
  at: string;
  price?: number;
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
  /** Scroll to and mark the candle/price that fired an alert. */
  triggerFocus?: ChartTriggerFocus | null;
};

function candleAtTime(
  candles: OhlcCandle[],
  atMs: number,
  intervalMs: number,
): OhlcCandle | null {
  let containing: OhlcCandle | null = null;
  for (const candle of candles) {
    const openMs = Date.parse(candle.timestamp);
    if (!Number.isFinite(openMs)) {
      continue;
    }
    if (Math.abs(openMs - atMs) < 2000) {
      return candle;
    }
    if (openMs <= atMs && atMs < openMs + intervalMs) {
      containing = candle;
    }
  }
  return containing;
}

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
  triggerFocus = null,
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
    (
      alertType: "price" | "candle_close" | "market_structure",
      price: number,
      extra?: {
        candleTime?: string;
        structureEvent?: ChartAlertDraft["structureEvent"];
        structureDirection?: ChartAlertDraft["structureDirection"];
      },
    ) => void
  >(() => undefined);
  const isMobileRef = useRef(false);
  const persistLayoutRef = useRef<() => void>(() => undefined);
  const structureOnEventClickRef = useRef<(event: StructureEvent) => void>(() => undefined);
  const drawingSnapRef = useRef(true);
  const followLiveRef = useRef(true);
  const structureLayersRef = useRef(DEFAULT_STRUCTURE_LAYERS);
  const pinnedTooltipRef = useRef(false);
  const closedForChartStableRef = useRef<OhlcCandle[]>([]);
  const rehydrateOverlaysRef = useRef<() => void>(() => undefined);
  const onCreateAlertRef = useRef(onCreateAlert);
  const lastFormingTsRef = useRef<string | null>(null);
  const drawHistorySigRef = useRef<string | null>(null);

  const [interval, setInterval] = useState<ChartInterval>(intervalProp);
  const [chartType, setChartType] = useState<KLineChartType>("candle_solid");
  const [hoverY, setHoverY] = useState<number | null>(null);
  const [hoverPrice, setHoverPrice] = useState<number | null>(null);
  const [hoverTimeLabel, setHoverTimeLabel] = useState<string | null>(null);
  const [hoverOhlc, setHoverOhlc] = useState<{
    open: number;
    high: number;
    low: number;
    close: number;
  } | null>(null);
  const [pinnedTooltip, setPinnedTooltip] = useState(false);
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [resetFlash, setResetFlash] = useState(false);
  const [latestFlash, setLatestFlash] = useState(false);
  const [cachedClosed, setCachedClosed] = useState<OhlcCandle[]>([]);
  const [dataReady, setDataReady] = useState(false);
  const [focusPinned, setFocusPinned] = useState(Boolean(triggerFocus?.at));
  const focusPinnedRef = useRef(focusPinned);
  const triggerFocusRef = useRef(triggerFocus);
  focusPinnedRef.current = focusPinned;
  triggerFocusRef.current = triggerFocus;
  const [activeIndicators, setActiveIndicators] = useState<Set<string>>(() => new Set());

  const structureLayers = useChartPrefsStore((s) => s.layers);
  const followLive = useChartPrefsStore((s) => s.followLive);
  const drawingSnap = useChartPrefsStore((s) => s.drawingSnap);
  const toggleLayer = useChartPrefsStore((s) => s.toggleLayer);
  const setFollowLive = useChartPrefsStore((s) => s.setFollowLive);
  const setDrawingSnap = useChartPrefsStore((s) => s.setDrawingSnap);

  pairRef.current = pair;
  intervalRef.current = interval;
  drawingSnapRef.current = drawingSnap;
  followLiveRef.current = followLive;
  structureLayersRef.current = structureLayers;
  pinnedTooltipRef.current = pinnedTooltip;

  const isMobile = useIsMobile();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  isDarkRef.current = isDark;
  const { alerts } = useObserverAlerts();

  const pairKey = normalizePairKey(pair);
  const pairAlerts = useMemo(
    () =>
      [...alerts.active, ...alerts.waiting].filter(
        (alert) =>
          normalizePairKey(alert.pair) === pairKey &&
          ((alert.alert_type === "price" && alert.target_price !== null) ||
            alert.alert_type === "market_structure"),
      ),
    [alerts.active, alerts.waiting, pairKey],
  );

  const priceAlerts = useMemo(
    () => pairAlerts.filter((alert) => alert.alert_type === "price"),
    [pairAlerts],
  );

  const structureAlerts = useMemo(
    () => pairAlerts.filter((alert) => alert.alert_type === "market_structure"),
    [pairAlerts],
  );

  const ohlcParams = useMemo(() => {
    if (!focusPinned || !triggerFocus?.at) {
      return { pair, interval, limit };
    }
    const atMs = Date.parse(triggerFocus.at);
    if (!Number.isFinite(atMs)) {
      return { pair, interval, limit };
    }
    const intervalMs = chartIntervalToSeconds(interval) * 1000;
    const start = new Date(atMs - 80 * intervalMs).toISOString();
    const endMs = Math.max(atMs + intervalMs, Math.min(Date.now(), atMs + 160 * intervalMs));
    return {
      pair,
      interval,
      limit: Math.max(limit, 400),
      start,
      end: new Date(endMs).toISOString(),
    };
  }, [focusPinned, interval, limit, pair, triggerFocus?.at]);
  const historyKey = useMemo(() => chartFormingOhlcKey(ohlcParams), [ohlcParams]);

  const {
    data: formingOhlcData,
    isInitialLoading: ohlcLoading,
    error: ohlcError,
  } = useHistoricalOhlcWithForming(ohlcParams);

  const {
    formingCandle: formingCandleWs,
    livePrice: streamLivePrice,
    status: formingStreamStatus,
  } = useChartFormingStream(pair, interval, { closedOhlcKey: historyKey });

  const closedFromHttp = useMemo(
    () => formingOhlcData?.candles?.filter((c) => !c.is_forming) ?? [],
    [formingOhlcData],
  );

  const closedBase = useMemo(
    () => (cachedClosed.length > 0 ? cachedClosed : closedFromHttp),
    [cachedClosed, closedFromHttp],
  );

  const closedForChartRaw = useMemo(
    () => resolveClosedCandles(formingOhlcData, closedBase),
    [formingOhlcData, closedBase],
  );

  const closedForChart = useMemo(() => {
    if (closedCandlesContentEqual(closedForChartStableRef.current, closedForChartRaw)) {
      return closedForChartStableRef.current;
    }
    closedForChartStableRef.current = closedForChartRaw;
    return closedForChartRaw;
  }, [closedForChartRaw]);

  const displayLivePrice = streamLivePrice ?? livePrice;
  const structureAlertAnchorPrice = useMemo(
    () => closedForChart.at(-1)?.close,
    [closedForChart],
  );

  const formingCandle = useMemo(() => {
    const base =
      formingCandleWs ??
      extractFormingCandle(formingOhlcData) ??
      synthesizeFormingFromLive(displayLivePrice, closedForChart, interval);
    return applyLivePriceToForming(base, displayLivePrice);
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
    chartInstance.setOffsetRightDistance(80);
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

  useEffect(() => {
    setFocusPinned(Boolean(triggerFocus?.at));
  }, [triggerFocus?.at, pair]);

  const scrollToTrigger = useCallback((chart: Chart) => {
    const focus = triggerFocusRef.current;
    if (!focusPinnedRef.current || !focus?.at) {
      syncTriggerFocusOverlay(chart, null);
      return;
    }
    const atMs = Date.parse(focus.at);
    if (!Number.isFinite(atMs)) {
      return;
    }
    const intervalMs = chartIntervalToSeconds(intervalRef.current) * 1000;
    const candle = candleAtTime(closedCandlesRef.current, atMs, intervalMs);
    const candleTimestampMs = candle ? Date.parse(candle.timestamp) : atMs;
    const price =
      typeof focus.price === "number" && Number.isFinite(focus.price)
        ? focus.price
        : candle?.close;
    syncTriggerFocusOverlay(chart, {
      price,
      candleTimestampMs: Number.isFinite(candleTimestampMs) ? candleTimestampMs : undefined,
    });
    const dataList = chart.getDataList();
    if (dataList.length === 0 || !Number.isFinite(candleTimestampMs)) {
      return;
    }
    let nearest = 0;
    let nearestDiff = Number.POSITIVE_INFINITY;
    for (let i = 0; i < dataList.length; i += 1) {
      const timestamp = dataList[i]?.timestamp;
      if (typeof timestamp !== "number") {
        continue;
      }
      const diff = Math.abs(timestamp - candleTimestampMs);
      if (diff < nearestDiff) {
        nearestDiff = diff;
        nearest = i;
      }
    }
    if (!dataList[nearest]) {
      return;
    }
    chart.scrollToDataIndex(nearest);
  }, []);
  const scrollToTriggerRef = useRef(scrollToTrigger);
  scrollToTriggerRef.current = scrollToTrigger;

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) {
      return;
    }
    if (!focusPinned || !triggerFocus?.at) {
      syncTriggerFocusOverlay(chart, null);
      return;
    }
    if (closedForChart.length === 0) {
      return;
    }
    scrollToTrigger(chart);
  }, [closedForChart, focusPinned, scrollToTrigger, triggerFocus]);

  const resetView = useCallback(() => {
    const chart = chartRef.current;
    if (!chart) {
      return;
    }
    setFollowLive(true);
    setFocusPinned(false);
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
    setFollowLive(true);
    setFocusPinned(false);
    userHasPannedRef.current = false;
    chart.scrollToRealTime(200);
    flashButton("latest");
    toast.message("Showing latest candles");
  }, [flashButton]);

  const fitView = useCallback(() => {
    const chart = chartRef.current;
    const container = containerRef.current;
    if (!chart || !container) {
      return;
    }
    const count = Math.max(chart.getDataList().length, 1);
    const width = Math.max(container.clientWidth - 72, 80);
    chart.setBarSpace(Math.max(1, Math.min(24, width / count)));
    chart.scrollToDataIndex(0);
    setFollowLive(false);
    userHasPannedRef.current = true;
    toast.message("Fit all bars");
  }, []);

  const openAlertDraft = useCallback(
    (
      alertType: "price" | "candle_close" | "market_structure",
      price: number,
      extra?: {
        candleTime?: string;
        structureEvent?: ChartAlertDraft["structureEvent"];
        structureDirection?: ChartAlertDraft["structureDirection"];
      },
    ) => {
      onCreateAlertRef.current?.({
        pair,
        alertType,
        price,
        interval,
        candleTime: extra?.candleTime,
        structureEvent: extra?.structureEvent,
        structureDirection: extra?.structureDirection,
      });
      setPlusMenuOpen(false);
    },
    [interval, pair],
  );

  const handleCrosshairChange = useCallback<ActionCallback>((data) => {
    const crosshair = data as Crosshair;
    const chart = chartRef.current;
    if (!chart || crosshair.x === undefined || crosshair.y === undefined) {
      if (!pinnedTooltipRef.current) {
        setHoverY(null);
        setHoverPrice(null);
        setHoverTimeLabel(null);
        setHoverOhlc(null);
      }
      return;
    }

    setHoverY(crosshair.y);
    const price = priceFromChartCoordinate(chart, crosshair.x, crosshair.y);
    setHoverPrice(price);

    const k = crosshair.kLineData;
    if (k && typeof k.open === "number") {
      setHoverOhlc({ open: k.open, high: k.high, low: k.low, close: k.close });
    } else {
      setHoverOhlc(null);
    }

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
      const chart = chartRef.current;
      const container = containerRef.current;
      if (!chart || !container) {
        return;
      }

      if (isMobileRef.current && onCreateAlertRef.current) {
        const rect = container.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        const price = priceFromChartCoordinate(chart, x, y);
        if (price === null) {
          return;
        }
        const dataList = chart.getDataList();
        const last = dataList.at(-1);
        if (last && crosshairMatchesLastBar(event, chart, last)) {
          openAlertDraftRef.current("candle_close", price);
        }
        return;
      }

      setPinnedTooltip((prev) => !prev);
    },
    [],
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
    onCreateAlertRef.current = onCreateAlert;
  }, [onCreateAlert]);

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
    lastFormingTsRef.current = null;
    drawHistorySigRef.current = null;
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
    chart.setOffsetRightDistance(80);

    let pointerDown = false;
    const markUserPan = () => {
      if (followLiveRef.current) {
        setFollowLive(false);
      }
      userHasPannedRef.current = true;
    };
    const onPointerDown = () => {
      pointerDown = true;
    };
    const onPointerUp = () => {
      pointerDown = false;
    };
    const onPointerMove = () => {
      if (pointerDown) {
        markUserPan();
      }
    };

    chart.subscribeAction("onCrosshairChange", handleCrosshairChange);
    container.addEventListener("pointerdown", onPointerDown);
    container.addEventListener("pointerup", onPointerUp);
    container.addEventListener("pointercancel", onPointerUp);
    container.addEventListener("pointerleave", onPointerUp);
    container.addEventListener("pointermove", onPointerMove);
    container.addEventListener("wheel", markUserPan, { passive: true });
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
        chart.setOffsetRightDistance(80);
        rehydrateOverlaysRef.current();
        pushFormingBar(subscribeBarRef.current, formingCandleRef.current);
        if (focusPinnedRef.current) {
          scrollToTriggerRef.current(chart);
        } else if (followLiveRef.current) {
          chart.scrollToRealTime(0);
        }
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
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("pointerup", onPointerUp);
      container.removeEventListener("pointercancel", onPointerUp);
      container.removeEventListener("pointerleave", onPointerUp);
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("wheel", markUserPan);
      chart.unsubscribeAction("onCrosshairChange", handleCrosshairChange);
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
        chart.setOffsetRightDistance(80);
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
    const newLast = closedForChart.at(-1) ?? null;
    const newLastTs = newLast?.timestamp ?? null;
    const lastTsChanged = prevLastTs !== null && newLastTs !== prevLastTs;
    const oneBarAdvanced = closedForChart.at(-2)?.timestamp === prevLastTs;

    prevClosedCountRef.current = newCount;
    prevLastClosedTsRef.current = newLastTs;

    if (prevCount === 0 && newCount > 0) {
      resetChartWithLayout(chart);
      return;
    }

    if (lastTsChanged && oneBarAdvanced && subscribeBarRef.current && newLast) {
      subscribeBarRef.current(ohlcToKLineData(newLast));
      pushFormingBar(subscribeBarRef.current, formingCandleRef.current);
      if (followLiveRef.current && !focusPinnedRef.current) {
        chart.scrollToRealTime(0);
      }
      return;
    }

    if (lastTsChanged) {
      resetChartWithLayout(chart);
    }
  }, [closedForChart, resetChartWithLayout]);

  useEffect(() => {
    pushFormingBar(subscribeBarRef.current, formingCandle);
    const ts = formingCandle?.timestamp ?? null;
    if (ts !== lastFormingTsRef.current) {
      lastFormingTsRef.current = ts;
      if (followLive && !focusPinned) {
        chartRef.current?.scrollToRealTime(0);
      }
    }
  }, [formingCandle, followLive, focusPinned]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) {
      return;
    }
    syncAlertOverlays(chart, structureLayers.alertLines ? priceAlerts : []);
  }, [priceAlerts, structureLayers.alertLines]);

  const { live: drawLive, biasSeries: drawBiasSeries } = useDrawOnLiquidity(
    showDrawOnLiquidity ? pair : "",
    displayLivePrice,
  );

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) {
      return;
    }
    if (!showDrawOnLiquidity || !structureLayers.pdhPdl || !drawLive) {
      syncPrevDayLevels(chart, null);
      return;
    }
    syncPrevDayLevels(chart, {
      pdh: drawLive.pdh,
      pdl: drawLive.pdl,
      draw: drawLive.draw,
    });
  }, [showDrawOnLiquidity, structureLayers.pdhPdl, drawLive?.pdh, drawLive?.pdl, drawLive?.draw]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) {
      return;
    }
    const enabled = showDrawOnLiquidity && showDrawHistory;
    const sig = enabled
      ? drawBiasSeries
          .map(
            (day) =>
              `${day.date}|${day.pdh}|${day.pdl}|${day.outcome}|${day.sweptHigh}|${day.sweptLow}`,
          )
          .join(";")
      : "";
    if (sig === drawHistorySigRef.current) {
      return;
    }
    drawHistorySigRef.current = sig;
    syncDrawHistory(chart, enabled ? drawBiasSeries : []);
  }, [showDrawOnLiquidity, showDrawHistory, drawBiasSeries]);

  const structure = useMemo(
    () => computeMarketStructure(closedForChart),
    [closedForChart],
  );

  const onStructureEventClick = useCallback(
    (event: StructureEvent) => {
      openAlertDraft("market_structure", event.level, {
        candleTime: event.timestamp,
        structureEvent: structureEventKey(event.kind),
        structureDirection: event.dir,
      });
    },
    [openAlertDraft],
  );

  useEffect(() => {
    structureOnEventClickRef.current = onStructureEventClick;
  }, [onStructureEventClick]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) {
      return;
    }
    syncMarketStructureOverlays(
      chart,
      structure,
      closedForChart,
      structureLayers,
      (ev) => structureOnEventClickRef.current(ev),
    );
  }, [structure, closedForChart, structureLayers]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) {
      return;
    }
    syncPendingStructureAlertOverlays(
      chart,
      structureAlerts,
      structureAlertAnchorPrice,
      structureLayers.pendingStructureAlerts,
    );
  }, [
    structureAlerts,
    structureAlertAnchorPrice,
    structureLayers.pendingStructureAlerts,
    closedForChart,
  ]);

  // Keep a stable rehydrate callback for getBars after resetData clears system overlays.
  useEffect(() => {
    rehydrateOverlaysRef.current = () => {
      const chart = chartRef.current;
      if (!chart) {
        return;
      }
      const layers = structureLayersRef.current;
      syncAlertOverlays(chart, layers.alertLines ? priceAlerts : []);
      if (showDrawOnLiquidity && layers.pdhPdl && drawLive) {
        syncPrevDayLevels(chart, {
          pdh: drawLive.pdh,
          pdl: drawLive.pdl,
          draw: drawLive.draw,
        });
      } else {
        syncPrevDayLevels(chart, null);
      }
      if (showDrawOnLiquidity && showDrawHistory) {
        syncDrawHistory(chart, drawBiasSeries);
      } else {
        syncDrawHistory(chart, []);
      }
      syncMarketStructureOverlays(
        chart,
        structure,
        closedForChart,
        layers,
        (ev) => structureOnEventClickRef.current(ev),
      );
      syncPendingStructureAlertOverlays(
        chart,
        structureAlerts,
        structureAlertAnchorPrice,
        layers.pendingStructureAlerts,
      );
    };
  }, [
    priceAlerts,
    showDrawOnLiquidity,
    showDrawHistory,
    drawLive,
    drawBiasSeries,
    structure,
    closedForChart,
    structureAlerts,
    structureAlertAnchorPrice,
  ]);

  const scrollToBarIndex = useCallback((index: number) => {
    const chart = chartRef.current;
    if (!chart) {
      return;
    }
    setFollowLive(false);
    chart.scrollToDataIndex(index);
  }, []);

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
    chart.createOverlay({
      name: overlayName,
      mode: drawingSnapRef.current ? "weak_magnet" : "normal",
    });
    window.setTimeout(() => {
      const layout = captureChartLayout(chart, activeIndicatorsRef.current);
      saveChartLayout(pairRef.current, intervalRef.current, layout);
    }, 500);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }
      const chart = chartRef.current;
      if (!chart) {
        return;
      }
      if (event.key === "v" || event.key === "V") {
        event.preventDefault();
        return;
      }
      if (event.key === "l" || event.key === "L") {
        event.preventDefault();
        startDrawing("segment");
      }
      if (event.key === "h" || event.key === "H") {
        event.preventDefault();
        startDrawing("rayLine");
      }
      if (event.key === "Escape") {
        event.preventDefault();
        const overlays = chart.getOverlays();
        const drawing = overlays.find(
          (o) => o.id && !isSystemOverlayId(o.id) && (o.currentStep ?? 0) < (o.totalStep ?? 1),
        );
        if (drawing?.id) {
          chart.removeOverlay({ id: drawing.id });
        }
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        const overlays = chart.getOverlays().filter((o) => o.id && !isSystemOverlayId(o.id));
        const last = overlays.at(-1);
        if (last?.id) {
          event.preventDefault();
          chart.removeOverlay({ id: last.id });
          persistLayoutRef.current();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [startDrawing]);

  const isInitialLoading = ohlcLoading && !formingOhlcData;
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
                  }${drawLive.hasIntradayData && drawLive.drawReached ? " ✓" : ""}`
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
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={toolbarButtonClass}
            onClick={fitView}
          >
            Fit
          </Button>
          <Button
            type="button"
            size="sm"
            variant={followLive ? "default" : "outline"}
            className={toolbarButtonClass}
            onClick={() => {
              setFollowLive(true);
              userHasPannedRef.current = false;
              chartRef.current?.scrollToRealTime(200);
            }}
          >
            Follow
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
                {hoverOhlc ? (
                  <span className="text-muted-foreground">
                    O {hoverOhlc.open} H {hoverOhlc.high} L {hoverOhlc.low} C {hoverOhlc.close}
                  </span>
                ) : null}
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
            {onCreateAlert && hoverY !== null && hoverPrice !== null ? (
              <Popover open={plusMenuOpen} onOpenChange={setPlusMenuOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="absolute left-1 z-20 flex h-9 w-9 items-center justify-center rounded-full border bg-card text-primary shadow-md transition active:scale-[0.97] sm:h-7 sm:w-7"
                    style={{ top: hoverY - 18 }}
                    onClick={(event) => event.stopPropagation()}
                    aria-label="Create alert at hovered price"
                  >
                    <PlusIcon className="h-4 w-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-56 p-2">
                  <ChartAlertMenu
                    price={hoverPrice}
                    onPrice={() => openAlertDraft("price", hoverPrice)}
                    onCandle={() => openAlertDraft("candle_close", hoverPrice)}
                    onBos={() =>
                      openAlertDraft("market_structure", hoverPrice, {
                        structureEvent: "bos",
                        structureDirection: "any",
                      })
                    }
                    onChoch={() =>
                      openAlertDraft("market_structure", hoverPrice, {
                        structureEvent: "choch",
                        structureDirection: "any",
                      })
                    }
                    onSweep={() =>
                      openAlertDraft("market_structure", hoverPrice, {
                        structureEvent: "sweep",
                        structureDirection: "any",
                      })
                    }
                  />
                </PopoverContent>
              </Popover>
            ) : null}
          </div>
        </div>
        {!isMobile && (hoverOhlc || pinnedTooltip) ? (
          <div
            className={cn(
              "mt-2 rounded-md border bg-card/90 px-3 py-2 font-mono text-xs",
              pinnedTooltip && "border-primary",
            )}
          >
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {hoverTimeLabel ? <span>{hoverTimeLabel}</span> : null}
              {hoverOhlc ? (
                <>
                  <span>O {hoverOhlc.open}</span>
                  <span>H {hoverOhlc.high}</span>
                  <span>L {hoverOhlc.low}</span>
                  <span>C {hoverOhlc.close}</span>
                </>
              ) : null}
              {structure.lastAtr != null ? <span>ATR {structure.lastAtr.toFixed(5)}</span> : null}
              {pinnedTooltip ? <span className="text-primary">pinned</span> : null}
            </div>
          </div>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {(
            [
              ["levels", "Levels"],
              ["breaks", "Breaks"],
              ["sweeps", "Sweeps"],
              ["atrZone", "ATR zone"],
              ["pdhPdl", "PDH/PDL"],
              ["alertLines", "Alert lines"],
              ["pendingStructureAlerts", "Structure alerts"],
            ] as Array<[keyof StructureLayerFlags, string]>
          ).map(([key, label]) => (
            <label key={key} className="flex cursor-pointer items-center gap-1.5">
              <Checkbox
                checked={structureLayers[key]}
                onCheckedChange={() => toggleLayer(key)}
              />
              {label}
            </label>
          ))}
          <label className="flex cursor-pointer items-center gap-1.5">
            <Checkbox
              checked={drawingSnap}
              onCheckedChange={(checked) => setDrawingSnap(checked === true)}
            />
            Snap OHLC
          </label>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StructureChip
            k="Structure"
            v={structure.trend === "up" ? "Uptrend" : structure.trend === "down" ? "Downtrend" : "—"}
          />
          <StructureChip
            k="Last high"
            v={structure.lastHigh ? String(structure.lastHigh.price) : "—"}
          />
          <StructureChip
            k="Last low"
            v={structure.lastLow ? String(structure.lastLow.price) : "—"}
          />
          <StructureChip
            k="Sweeps"
            v={String(structure.events.filter((e) => e.kind === "SWEEP").length)}
          />
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border">
            <div className="border-b px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Swing log ({structure.pivots.length})
            </div>
            <div className="max-h-40 overflow-y-auto">
              {structure.pivots.length === 0 ? (
                <p className="px-3 py-4 text-xs text-muted-foreground">No confirmed pivots yet.</p>
              ) : (
                [...structure.pivots].reverse().map((p) => (
                  <button
                    key={`${p.type}-${p.index}`}
                    type="button"
                    className="flex w-full items-center justify-between gap-2 border-b px-3 py-1.5 text-left text-xs last:border-0 hover:bg-muted/50"
                    onClick={() => scrollToBarIndex(p.index)}
                  >
                    <span className="font-mono">{p.label ?? p.type}</span>
                    <span className="font-mono">{p.price}</span>
                  </button>
                ))
              )}
            </div>
          </div>
          <div className="rounded-lg border">
            <div className="border-b px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Break / sweep log ({structure.events.length})
            </div>
            <div className="max-h-40 overflow-y-auto">
              {structure.events.length === 0 ? (
                <p className="px-3 py-4 text-xs text-muted-foreground">No BOS / CHoCH / sweep yet.</p>
              ) : (
                [...structure.events].reverse().map((ev, i) => (
                  <button
                    key={`${ev.kind}-${ev.index}-${i}`}
                    type="button"
                    className="flex w-full items-center justify-between gap-2 border-b px-3 py-1.5 text-left text-xs last:border-0 hover:bg-muted/50"
                    onClick={() => {
                      scrollToBarIndex(ev.index);
                      onStructureEventClick(ev);
                    }}
                  >
                    <span className="font-medium">{ev.kind}</span>
                    <span className="font-mono">{ev.dir} · {ev.level}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {isMobile
            ? "Red line is live price. Tap + to create an alert, or tap the forming candle for a close alert."
            : "Red line is live price. Click + to create an alert. V pan · L line · H ray · Esc cancel · Del undo."}
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

function StructureChip({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2">
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{k}</div>
      <div className="font-mono text-sm">{v}</div>
    </div>
  );
}

function ChartAlertMenu({
  onPrice,
  onCandle,
  onBos,
  onChoch,
  onSweep,
}: {
  price: number;
  onPrice: () => void;
  onCandle: () => void;
  onBos: () => void;
  onChoch: () => void;
  onSweep: () => void;
}) {
  return (
    <div className="grid gap-1">
      <Button type="button" size="sm" variant="ghost" className="justify-start" onClick={onPrice}>
        Price alert
      </Button>
      <Button type="button" size="sm" variant="ghost" className="justify-start" onClick={onCandle}>
        Candle close alert
      </Button>
      <Button type="button" size="sm" variant="ghost" className="justify-start" onClick={onBos}>
        Next BOS (this TF)
      </Button>
      <Button type="button" size="sm" variant="ghost" className="justify-start" onClick={onChoch}>
        Next CHoCH (this TF)
      </Button>
      <Button type="button" size="sm" variant="ghost" className="justify-start" onClick={onSweep}>
        Next sweep (this TF)
      </Button>
    </div>
  );
}
