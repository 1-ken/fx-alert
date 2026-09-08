"use client";

import { useEffect, useMemo, useRef } from "react";
import { useTheme } from "next-themes";
import { dispose, init, type Chart } from "klinecharts";
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
  chartIntervalToPeriod,
  getKLineChartStyles,
  ohlcListToKLineData,
  syncPrevDayLevels,
  syncTradeSetupLevels,
} from "@/lib/klinechart-utils";
import { cn } from "@/lib/utils";

interface BacktestSetupChartProps {
  setup: BacktestSetup;
  interval: ChartInterval;
  onIntervalChange: (interval: ChartInterval) => void;
  height?: number;
}

function applySetupOverlays(chart: Chart, setup: BacktestSetup): void {
  if (setup.kind === "draw_on_liquidity") {
    syncTradeSetupLevels(chart, null);
    syncPrevDayLevels(chart, {
      pdh: setup.day.pdh,
      pdl: setup.day.pdl,
      draw: setup.day.draw,
    });
    return;
  }
  syncPrevDayLevels(chart, null);
  syncTradeSetupLevels(chart, setup.trade);
}

export function BacktestSetupChart({
  setup,
  interval,
  onIntervalChange,
  height = 480,
}: BacktestSetupChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<Chart | null>(null);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const ohlcWindow = useMemo(
    () => candleWindowForSetup(setup, interval),
    [setup, interval],
  );
  const focusTs = useMemo(() => setupFocusTimestamp(setup), [setup]);

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

  useEffect(() => {
    const container = containerRef.current;
    if (!container || klineData.length === 0) {
      return;
    }

    const chart = init(container, {
      styles: getKLineChartStyles(isDark),
      timezone: DISPLAY_CHART_TIMEZONE,
    });
    if (!chart) {
      return;
    }

    chartRef.current = chart;
    chart.setTimezone(DISPLAY_CHART_TIMEZONE);
    chart.setStyles({
      candle: {
        priceMark: {
          last: { show: false },
        },
      },
    });
    chart.setSymbol({ ticker: setup.pair, pricePrecision: 5, volumePrecision: 0 });
    chart.setPeriod(chartIntervalToPeriod(interval));
    chart.setOffsetRightDistance(64);
    chart.setDataLoader({
      getBars: ({ type, callback }) => {
        if (type !== "init") {
          callback([], { backward: false, forward: false });
          return;
        }
        callback(klineData, { backward: false, forward: false });
        applySetupOverlays(chart, setup);
        if (Number.isFinite(focusTs)) {
          chart.scrollToTimestamp(focusTs);
        }
      },
    });

    const resizeObserver = new ResizeObserver(() => {
      chart.resize();
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chartRef.current = null;
      dispose(chart);
    };
  }, [setup, interval, klineData, isDark, focusTs]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">
            {setup.pair} · {interval} replay
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
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
            <Select
              value={interval}
              onValueChange={(value) => onIntervalChange(value as ChartInterval)}
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
        <SetupLegend setup={setup} />
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

function SetupLegend({ setup }: { setup: BacktestSetup }) {
  if (setup.kind === "draw_on_liquidity") {
    return (
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <LegendDot color="#22d3ee" label="PDH" />
        <LegendDot color="#f59e0b" label="PDL" />
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      <LegendDot color="#3b82f6" label="Entry" />
      <LegendDot color="#dc2626" label="Stop" />
      <LegendDot color="#16a34a" label="Target" />
      <LegendDot color="#f59e0b" label="Sweep" />
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
