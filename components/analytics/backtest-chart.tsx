"use client";

import { useEffect, useMemo, useRef } from "react";
import { useTheme } from "next-themes";
import { dispose, init, utils, type KLineData } from "klinecharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  chartIntervalToPeriod,
  getKLineChartStyles,
  syncDrawHistory,
} from "@/lib/klinechart-utils";
import type { DayBias } from "@/lib/draw-on-liquidity";
import type { BacktestDay } from "@/types/analytics";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function seriesToKLineData(series: BacktestDay[]): KLineData[] {
  return series
    .map((d) => ({
      timestamp: new Date(d.date).getTime(),
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    }))
    .filter((d) => Number.isFinite(d.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp);
}

/** Adapt the backtest response (snake_case) to the DayBias shape used by overlays. */
function toDayBias(series: BacktestDay[]): DayBias[] {
  return series.map((d) => ({
    date: d.date,
    pdh: d.pdh,
    pdl: d.pdl,
    open: d.open,
    high: d.high,
    low: d.low,
    close: d.close,
    outcome: d.outcome,
    draw: d.draw,
    bias: d.bias,
    sweptHigh: d.swept_high,
    sweptLow: d.swept_low,
    displaced: d.displaced,
    drawHit: d.draw_hit,
  }));
}

interface BacktestChartProps {
  pair: string;
  series: BacktestDay[];
  height?: number;
}

/**
 * Static daily replay chart for the backtest. Renders exactly the candles the
 * analytics service returned for the selected range, with per-day PDH/PDL levels
 * and sweep/displacement markers. No live stream or forming candle.
 */
export function BacktestChart({ pair, series, height = 420 }: BacktestChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const klineData = useMemo(() => seriesToKLineData(series), [series]);
  const biasSeries = useMemo(() => toDayBias(series), [series]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || klineData.length === 0) {
      return;
    }

    const chart = init(container, { styles: getKLineChartStyles(isDark) });
    if (!chart) {
      return;
    }

    chart.setSymbol({ ticker: pair, pricePrecision: 5, volumePrecision: 0 });
    chart.setPeriod(chartIntervalToPeriod("1d"));
    chart.setFormatter({
      formatDate: ({ dateTimeFormat, timestamp, template, type }) => {
        const base = utils.formatDate(dateTimeFormat, timestamp, template);
        if (type === "tooltip" || type === "crosshair") {
          return `${WEEKDAYS[new Date(timestamp).getUTCDay()]} ${base}`;
        }
        return base;
      },
    });
    chart.setDataLoader({
      getBars: ({ type, callback }) => {
        if (type !== "init") {
          callback([], { backward: false, forward: false });
          return;
        }
        callback(klineData, { backward: false, forward: false });
        syncDrawHistory(chart, biasSeries);
      },
    });

    const resizeObserver = new ResizeObserver(() => {
      chart.resize();
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      dispose(chart);
    };
  }, [pair, klineData, biasSeries, isDark]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">{pair} · Daily replay</CardTitle>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <Legend color="#22d3ee" label="PDH" />
            <Legend color="#f59e0b" label="PDL" />
            <Legend color="#16a34a" label="Displaced up (D)" />
            <Legend color="#dc2626" label="Displaced down (D)" />
            <Legend color="#a855f7" label="Reversal (R)" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {klineData.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            No candles to display for this range.
          </p>
        ) : (
          <div ref={containerRef} style={{ height }} className="w-full" />
        )}
      </CardContent>
    </Card>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
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
