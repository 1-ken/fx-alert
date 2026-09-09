"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTheme } from "next-themes";
import { dispose, init, type Chart, type KLineData } from "klinecharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useHistoricalOhlc } from "@/hooks/historical/use-historical";
import {
  CHART_INTERVAL_OPTIONS,
  type ChartInterval,
} from "@/lib/chart-utils";
import {
  candleWindowForSetup,
  DISPLAY_CHART_TIMEZONE,
  setupFocusTimestamp,
  type BacktestSetup,
} from "@/lib/backtest-setup";
import {
  nearestBarIndex,
  replayRange,
  REPLAY_SPEEDS,
  type ReplaySpeed,
} from "@/lib/backtest-replay";
import {
  CANDLE_COLOR_SCHEMES,
  candleBarStyles,
  candleColorSchemeById,
  loadCandleColorSchemeId,
  saveCandleColorSchemeId,
  type CandleColorSchemeId,
} from "@/lib/candle-color-schemes";
import {
  pricePrecisionForPair,
  syncTradePositionOverlay,
} from "@/lib/position-overlay";
import {
  DEFAULT_CHART_LABEL_VISIBILITY,
  loadChartLabelVisibility,
  saveChartLabelVisibility,
  type ChartLabelVisibility,
} from "@/lib/chart-label-visibility";
import {
  chartIntervalToPeriod,
  getKLineChartStyles,
  ohlcListToKLineData,
  syncEntryExitMarkers,
  syncPrevDayLevels,
  syncSweepCandleTags,
  syncTradeSetupLevels,
} from "@/lib/klinechart-utils";
import { cn } from "@/lib/utils";

interface BacktestSetupChartProps {
  setup: BacktestSetup;
  interval: ChartInterval;
  onIntervalChange: (interval: ChartInterval) => void;
  height?: number;
}

type ReplayStatus = "idle" | "playing" | "paused" | "done";

function applySetupOverlays(
  chart: Chart,
  setup: BacktestSetup,
  visibleBars: KLineData[],
  visibility: ChartLabelVisibility,
): void {
  const nearest = (timestampMs: number) => nearestBarIndex(visibleBars, timestampMs);

  if (setup.kind === "draw_on_liquidity") {
    syncTradePositionOverlay(chart, setup.pair, null, null);
    syncTradeSetupLevels(chart, null);
    syncEntryExitMarkers(chart, [], null, () => -1);
    syncSweepCandleTags(chart, [], null, () => -1, false);
    syncPrevDayLevels(chart, {
      pdh: setup.day.pdh,
      pdl: setup.day.pdl,
      draw: setup.day.draw,
    });
    return;
  }

  const trade = setup.trade;
  const isSweep = setup.strategy === "liquidity_sweep";
  syncPrevDayLevels(chart, null);
  syncTradeSetupLevels(chart, trade, visibility.sweepLevel);
  const entryIndex = nearestBarIndex(visibleBars, new Date(trade.time).getTime());
  const startBar = entryIndex >= 0 ? visibleBars[entryIndex] : visibleBars[0];
  const endBar = visibleBars[visibleBars.length - 1];
  if (startBar && endBar) {
    syncTradePositionOverlay(
      chart,
      setup.pair,
      trade,
      { startTs: startBar.timestamp, endTs: endBar.timestamp },
      endBar.close,
      visibility,
    );
  }
  syncEntryExitMarkers(chart, visibleBars, trade, nearest, {
    showEntry: isSweep ? visibility.entry5m : visibility.entryExit,
    showExit: visibility.entryExit,
    entryLabel: isSweep ? "5m entry" : "Entry",
  });
  syncSweepCandleTags(
    chart,
    visibleBars,
    isSweep ? trade : null,
    nearest,
    isSweep && visibility.sweep1h,
  );
}

export function BacktestSetupChart({
  setup,
  interval,
  onIntervalChange,
  height = 480,
}: BacktestSetupChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<Chart | null>(null);
  const klineDataRef = useRef<KLineData[]>([]);
  const appendBarRef = useRef<((bar: KLineData) => void) | null>(null);
  const timerRef = useRef<number | null>(null);
  const playIndexRef = useRef(0);
  const rangeEndRef = useRef(0);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const [colorSchemeId, setColorSchemeId] =
    useState<CandleColorSchemeId>("green_red");
  const [labelVisibility, setLabelVisibility] = useState<ChartLabelVisibility>(
    DEFAULT_CHART_LABEL_VISIBILITY,
  );
  const labelVisibilityRef = useRef(labelVisibility);
  labelVisibilityRef.current = labelVisibility;
  const [replaySpeed, setReplaySpeed] = useState<ReplaySpeed>("1x");
  const [replayStatus, setReplayStatus] = useState<ReplayStatus>("idle");

  const ohlcWindow = useMemo(
    () => candleWindowForSetup(setup, interval),
    [setup, interval],
  );
  const focusTs = useMemo(() => setupFocusTimestamp(setup), [setup]);
  const isTrade = setup.kind === "trade";
  const isSweep = isTrade && setup.strategy === "liquidity_sweep";
  const colorScheme = candleColorSchemeById(colorSchemeId);

  const { data, isLoading, error } = useHistoricalOhlc({
    pair: setup.pair,
    interval,
    start: ohlcWindow.start,
    end: ohlcWindow.end,
    limit: ohlcWindow.limit,
  });

  const klineData = useMemo(
    () => ohlcListToKLineData((data?.candles ?? []).filter((c) => !c.is_forming)),
    [data],
  );
  klineDataRef.current = klineData;

  const stopTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const applyColor = useCallback(
    (chart: Chart, schemeId: CandleColorSchemeId) => {
      chart.setStyles({
        candle: {
          bar: candleBarStyles(candleColorSchemeById(schemeId)),
          priceMark: { last: { show: false } },
        },
      });
    },
    [],
  );

  useEffect(() => {
    const stored = loadCandleColorSchemeId();
    setColorSchemeId(stored);
    if (chartRef.current) {
      applyColor(chartRef.current, stored);
    }
    const labels = loadChartLabelVisibility();
    setLabelVisibility(labels);
    labelVisibilityRef.current = labels;
  }, [applyColor]);

  const loadFullSeries = useCallback(
    (chart: Chart) => {
      appendBarRef.current = null;
      chart.setDataLoader({
        getBars: ({ type, callback }) => {
          if (type !== "init") {
            callback([], { backward: false, forward: false });
            return;
          }
          callback(klineDataRef.current, { backward: false, forward: false });
          applySetupOverlays(chart, setup, klineDataRef.current, labelVisibilityRef.current);
          if (Number.isFinite(focusTs)) {
            chart.scrollToTimestamp(focusTs);
          }
        },
        subscribeBar: ({ callback }) => {
          appendBarRef.current = callback;
        },
        unsubscribeBar: () => {
          appendBarRef.current = null;
        },
      });
    },
    [focusTs, setup],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container || klineData.length === 0) {
      return;
    }

    stopTimer();
    setReplayStatus("idle");

    const chart = init(container, {
      styles: getKLineChartStyles(isDark),
      timezone: DISPLAY_CHART_TIMEZONE,
    });
    if (!chart) {
      return;
    }

    chartRef.current = chart;
    chart.setTimezone(DISPLAY_CHART_TIMEZONE);
    applyColor(chart, colorSchemeId);
    chart.setSymbol({
      ticker: setup.pair,
      pricePrecision: pricePrecisionForPair(setup.pair),
      volumePrecision: 0,
    });
    chart.setPeriod(chartIntervalToPeriod(interval));
    chart.setOffsetRightDistance(64);
    loadFullSeries(chart);

    const resizeObserver = new ResizeObserver(() => {
      chart.resize();
    });
    resizeObserver.observe(container);

    return () => {
      stopTimer();
      resizeObserver.disconnect();
      chartRef.current = null;
      appendBarRef.current = null;
      dispose(chart);
    };
    // Color is applied separately so changing scheme does not remount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setup, interval, klineData, isDark, applyColor, loadFullSeries, stopTimer]);

  const resetReplay = useCallback(() => {
    const chart = chartRef.current;
    stopTimer();
    setReplayStatus("idle");
    if (chart) {
      loadFullSeries(chart);
    }
  }, [loadFullSeries, stopTimer]);

  const onColorChange = (next: CandleColorSchemeId) => {
    setColorSchemeId(next);
    saveCandleColorSchemeId(next);
    const chart = chartRef.current;
    if (!chart) {
      return;
    }
    if (replayStatus === "playing" || replayStatus === "paused") {
      resetReplay();
    }
    applyColor(chart, next);
  };

  const paintCurrentOverlays = useCallback(() => {
    const chart = chartRef.current;
    if (!chart) {
      return;
    }
    applySetupOverlays(
      chart,
      setup,
      chart.getDataList(),
      labelVisibilityRef.current,
    );
  }, [setup]);

  const onLabelToggle = (key: keyof ChartLabelVisibility, checked: boolean) => {
    const next = { ...labelVisibilityRef.current, [key]: checked };
    labelVisibilityRef.current = next;
    setLabelVisibility(next);
    saveChartLabelVisibility(next);
    paintCurrentOverlays();
  };

  const onIntervalSelect = (next: ChartInterval) => {
    stopTimer();
    setReplayStatus("idle");
    onIntervalChange(next);
  };

  const tickReplay = useCallback(() => {
    const chart = chartRef.current;
    const nextIndex = playIndexRef.current + 1;
    const bars = klineDataRef.current;
    if (!chart || nextIndex > rangeEndRef.current || nextIndex >= bars.length) {
      stopTimer();
      setReplayStatus("done");
      return;
    }
    playIndexRef.current = nextIndex;
    const bar = bars[nextIndex];
    appendBarRef.current?.(bar);
    applySetupOverlays(chart, setup, bars.slice(0, nextIndex + 1), labelVisibilityRef.current);
    chart.scrollToTimestamp(bar.timestamp);
    if (nextIndex >= rangeEndRef.current) {
      stopTimer();
      setReplayStatus("done");
    }
  }, [setup, stopTimer]);

  const startReplay = () => {
    if (setup.kind !== "trade") {
      return;
    }
    const chart = chartRef.current;
    const bars = klineDataRef.current;
    const range = replayRange(bars, setup.trade);
    if (!chart || !range) {
      return;
    }

    stopTimer();
    const initial = bars.slice(range.start, range.entry + 1);
    playIndexRef.current = range.entry;
    rangeEndRef.current = range.end;
    appendBarRef.current = null;

    chart.setDataLoader({
      getBars: ({ type, callback }) => {
        if (type !== "init") {
          callback([], { backward: false, forward: false });
          return;
        }
        callback(initial, { backward: false, forward: false });
        applySetupOverlays(chart, setup, initial, labelVisibilityRef.current);
        chart.scrollToTimestamp(bars[range.entry].timestamp);
      },
      subscribeBar: ({ callback }) => {
        appendBarRef.current = callback;
      },
      unsubscribeBar: () => {
        appendBarRef.current = null;
      },
    });

    setReplayStatus("playing");
    timerRef.current = window.setInterval(tickReplay, REPLAY_SPEEDS[replaySpeed]);
  };

  const pauseReplay = () => {
    stopTimer();
    setReplayStatus("paused");
  };

  const resumeReplay = () => {
    if (replayStatus !== "paused") {
      return;
    }
    setReplayStatus("playing");
    timerRef.current = window.setInterval(tickReplay, REPLAY_SPEEDS[replaySpeed]);
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">
            {setup.pair} · {interval} replay
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            {isTrade ? (
              <>
                {replayStatus === "playing" ? (
                  <Button type="button" size="sm" variant="outline" className="h-8" onClick={pauseReplay}>
                    Pause
                  </Button>
                ) : replayStatus === "paused" ? (
                  <Button type="button" size="sm" variant="outline" className="h-8" onClick={resumeReplay}>
                    Resume
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8"
                    disabled={klineData.length === 0}
                    onClick={startReplay}
                  >
                    Replay
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-8"
                  disabled={replayStatus === "idle"}
                  onClick={resetReplay}
                >
                  Reset
                </Button>
                <Select
                  value={replaySpeed}
                  onValueChange={(value) => {
                    const speed = value as ReplaySpeed;
                    setReplaySpeed(speed);
                    if (replayStatus === "playing") {
                      stopTimer();
                      timerRef.current = window.setInterval(tickReplay, REPLAY_SPEEDS[speed]);
                    }
                  }}
                >
                  <SelectTrigger className="h-8 w-[72px]" aria-label="Replay speed">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(REPLAY_SPEEDS) as ReplaySpeed[]).map((speed) => (
                      <SelectItem key={speed} value={speed}>
                        {speed}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8"
                disabled={klineData.length === 0}
                onClick={() => {
                  if (Number.isFinite(focusTs)) {
                    chartRef.current?.scrollToTimestamp(focusTs);
                  }
                }}
              >
                Focus setup
              </Button>
            )}
            <Select
              value={colorSchemeId}
              onValueChange={(value) => onColorChange(value as CandleColorSchemeId)}
            >
              <SelectTrigger className="h-8 w-[140px]" aria-label="Candle colors">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CANDLE_COLOR_SCHEMES.map((scheme) => (
                  <SelectItem key={scheme.id} value={scheme.id}>
                    {scheme.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isTrade ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" size="sm" variant="outline" className="h-8">
                    Labels
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuLabel>Show labels</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <LabelToggle
                    checked={labelVisibility.target}
                    onToggle={(checked) => onLabelToggle("target", checked)}
                  >
                    Target
                  </LabelToggle>
                  <LabelToggle
                    checked={labelVisibility.stop}
                    onToggle={(checked) => onLabelToggle("stop", checked)}
                  >
                    Stop
                  </LabelToggle>
                  <LabelToggle
                    checked={labelVisibility.center}
                    onToggle={(checked) => onLabelToggle("center", checked)}
                  >
                    Center / PnL
                  </LabelToggle>
                  <LabelToggle
                    checked={labelVisibility.entryExit}
                    onToggle={(checked) => onLabelToggle("entryExit", checked)}
                  >
                    Entry / Win / Stop tags
                  </LabelToggle>
                  <LabelToggle
                    checked={labelVisibility.sweepLevel}
                    onToggle={(checked) => onLabelToggle("sweepLevel", checked)}
                  >
                    Sweep level
                  </LabelToggle>
                  {isSweep ? (
                    <>
                      <LabelToggle
                        checked={labelVisibility.sweep1h}
                        onToggle={(checked) => onLabelToggle("sweep1h", checked)}
                      >
                        Sweep 1H high/low
                      </LabelToggle>
                      <LabelToggle
                        checked={labelVisibility.entry5m}
                        onToggle={(checked) => onLabelToggle("entry5m", checked)}
                      >
                        5m entry
                      </LabelToggle>
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            <Select
              value={interval}
              onValueChange={(value) => onIntervalSelect(value as ChartInterval)}
            >
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
          </div>
        </div>
        <SetupLegend setup={setup} up={colorScheme.up} down={colorScheme.down} />
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="py-12 text-center text-sm text-destructive">
            Could not load candles for this setup.
          </p>
        ) : null}
        {isLoading && klineData.length === 0 ? (
          <div className="flex items-center justify-center" style={{ height }}>
            <Spinner className="h-5 w-5" />
          </div>
        ) : null}
        {!isLoading && !error && klineData.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            No candles in this window for {interval}.
          </p>
        ) : null}
        <div
          ref={containerRef}
          style={{ height }}
          className={cn("w-full", klineData.length === 0 && "hidden")}
        />
      </CardContent>
    </Card>
  );
}

function LabelToggle({
  checked,
  onToggle,
  children,
}: {
  checked: boolean;
  onToggle: (checked: boolean) => void;
  children: ReactNode;
}) {
  return (
    <DropdownMenuCheckboxItem
      checked={checked}
      onSelect={(event) => event.preventDefault()}
      onCheckedChange={(value) => onToggle(value === true)}
    >
      {children}
    </DropdownMenuCheckboxItem>
  );
}

function SetupLegend({
  setup,
  up,
  down,
}: {
  setup: BacktestSetup;
  up: string;
  down: string;
}) {
  if (setup.kind === "draw_on_liquidity") {
    return (
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <LegendDot color="#22d3ee" label="PDH" />
        <LegendDot color="#f59e0b" label="PDL" />
        <LegendDot color={up} label="Bullish" />
        <LegendDot color={down} label="Bearish" />
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      <LegendDot color="rgba(8, 153, 129, 0.7)" label="Target" />
      <LegendDot color="rgba(242, 54, 69, 0.7)" label="Stop" />
      <LegendDot color="#f59e0b" label="Sweep" />
      <LegendDot color={up} label="Bullish" />
      <LegendDot color={down} label="Bearish" />
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className="inline-block h-2 w-3 rounded-sm"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}
