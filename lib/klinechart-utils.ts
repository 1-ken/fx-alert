import type {
  CandleType,
  Chart,
  DeepPartial,
  KLineData,
  OverlayCreate,
  Period,
  Point,
  Styles,
} from "klinecharts";
import type { ChartInterval } from "@/lib/chart-utils";
import { mergeFormingCandle, toChartTime } from "@/lib/chart-utils";
import type { OhlcCandle } from "@/types/historical";
import type { Alert } from "@/types/alerts";
import type { DayBias, DrawTarget } from "@/lib/draw-on-liquidity";
import { TRADE_POSITION_OVERLAY_ID } from "@/lib/position-math";
import {
  isStructureOverlayId,
  type StructureLayerFlags,
} from "@/lib/structure-overlay";

export const LIVE_OVERLAY_ID = "fx-live-price";
export const ALERT_OVERLAY_PREFIX = "fx-alert-";
export const PDH_OVERLAY_ID = "fx-pdh";
export const PDL_OVERLAY_ID = "fx-pdl";
export const DOL_SEGMENT_PREFIX = "fx-dol-";
export const SETUP_ENTRY_OVERLAY_ID = "fx-setup-entry";
export const SETUP_SL_OVERLAY_ID = "fx-setup-sl";
export const SETUP_TP_OVERLAY_ID = "fx-setup-tp";
export const SETUP_SWEEP_OVERLAY_ID = "fx-setup-sweep";
export const SETUP_ENTRY_MARK_ID = "fx-setup-entry-mark";
export const SETUP_EXIT_MARK_ID = "fx-setup-exit-mark";
export const SETUP_SWEEP_1H_MARK_ID = "fx-setup-sweep-1h-mark";

const DAY_MS = 86_400_000;
const PDH_COLOR = "#22d3ee";
const PDL_COLOR = "#f59e0b";
const DRAW_ACTIVE_COLOR = "#a855f7";
const OUTCOME_DISPLACED_UP = "#16a34a";
const OUTCOME_DISPLACED_DOWN = "#dc2626";
const OUTCOME_REVERSAL = "#a855f7";
const OUTCOME_NEUTRAL = "#94a3b8";

const STACKED_INDICATORS = new Set(["MA", "EMA", "BOLL"]);

export type UserOverlaySnapshot = {
  name: string;
  points: Partial<Point>[];
  styles?: OverlayCreate["styles"];
};

export type ChartLayoutSnapshot = {
  indicators: string[];
  overlays: UserOverlaySnapshot[];
  structureLayers?: StructureLayerFlags;
  followLive?: boolean;
};

export function chartLayoutStorageKey(pair: string, interval: string): string {
  const compact = pair.replace(/[^a-z0-9]/gi, "").toUpperCase();
  return `chart-layout|${compact}|${interval}`;
}

export function loadChartLayout(pair: string, interval: string): ChartLayoutSnapshot | null {
  if (typeof sessionStorage === "undefined") {
    return null;
  }
  try {
    const raw = sessionStorage.getItem(chartLayoutStorageKey(pair, interval));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as ChartLayoutSnapshot;
    if (!Array.isArray(parsed.indicators) || !Array.isArray(parsed.overlays)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveChartLayout(
  pair: string,
  interval: string,
  layout: ChartLayoutSnapshot,
): void {
  if (typeof sessionStorage === "undefined") {
    return;
  }
  try {
    sessionStorage.setItem(chartLayoutStorageKey(pair, interval), JSON.stringify(layout));
  } catch {
    // Ignore quota errors.
  }
}

export function isSystemOverlayId(id?: string): boolean {
  if (!id) {
    return false;
  }
  return (
    id === LIVE_OVERLAY_ID ||
    id === PDH_OVERLAY_ID ||
    id === PDL_OVERLAY_ID ||
    id === SETUP_ENTRY_OVERLAY_ID ||
    id === SETUP_SL_OVERLAY_ID ||
    id === SETUP_TP_OVERLAY_ID ||
    id === SETUP_SWEEP_OVERLAY_ID ||
    id === SETUP_ENTRY_MARK_ID ||
    id === SETUP_EXIT_MARK_ID ||
    id === SETUP_SWEEP_1H_MARK_ID ||
    id === TRADE_POSITION_OVERLAY_ID ||
    id.startsWith(ALERT_OVERLAY_PREFIX) ||
    id.startsWith(DOL_SEGMENT_PREFIX) ||
    isStructureOverlayId(id)
  );
}

export function snapshotUserOverlays(chart: Chart): UserOverlaySnapshot[] {
  return chart
    .getOverlays()
    .filter((overlay) => overlay.id && !isSystemOverlayId(overlay.id))
    .filter((overlay) => {
      const total = overlay.totalStep ?? 1;
      const step = overlay.currentStep ?? total;
      return step >= total - 1 && overlay.points.length > 0;
    })
    .map((overlay) => ({
      name: overlay.name,
      points: overlay.points.map((point) => ({ ...point })),
      styles: overlay.styles,
    }));
}

export function restoreUserOverlays(chart: Chart, snapshots: UserOverlaySnapshot[]): void {
  for (const snapshot of snapshots) {
    chart.createOverlay({
      name: snapshot.name,
      points: snapshot.points,
      styles: snapshot.styles,
    });
  }
}

export function getActiveIndicatorNames(chart: Chart): string[] {
  const names = new Set<string>();
  for (const indicator of chart.getIndicators({})) {
    if (indicator.name) {
      names.add(indicator.name);
    }
  }
  return [...names];
}

export function syncChartIndicators(chart: Chart, desiredNames: Iterable<string>): void {
  const desired = new Set(desiredNames);
  for (const indicator of chart.getIndicators({})) {
    if (indicator.name && !desired.has(indicator.name)) {
      chart.removeIndicator({ name: indicator.name });
    }
  }
  for (const name of desired) {
    if (chart.getIndicators({ name }).length > 0) {
      continue;
    }
    const isStack = STACKED_INDICATORS.has(name);
    chart.createIndicator(name, {
      isStack,
      pane: isStack ? { id: "candle_pane" } : undefined,
    });
  }
}

export function captureChartLayout(
  chart: Chart,
  activeIndicators: Iterable<string>,
  extras?: Pick<ChartLayoutSnapshot, "structureLayers" | "followLive">,
): ChartLayoutSnapshot {
  const indicators = [
    ...new Set([...getActiveIndicatorNames(chart), ...activeIndicators]),
  ];
  return {
    indicators,
    overlays: snapshotUserOverlays(chart),
    ...(extras?.structureLayers ? { structureLayers: extras.structureLayers } : {}),
    ...(extras?.followLive !== undefined ? { followLive: extras.followLive } : {}),
  };
}

export function applyChartLayout(chart: Chart, layout: ChartLayoutSnapshot | null): void {
  if (!layout) {
    return;
  }
  syncChartIndicators(chart, layout.indicators);
  restoreUserOverlays(chart, layout.overlays);
}

export type KLineChartType = CandleType;

export const KLINE_CHART_TYPE_OPTIONS: { value: KLineChartType; label: string }[] = [
  { value: "candle_solid", label: "Candles" },
  { value: "ohlc", label: "Bars" },
  { value: "area", label: "Area" },
];

export const KLINE_INDICATOR_OPTIONS = [
  { value: "MA", label: "MA" },
  { value: "EMA", label: "EMA" },
  { value: "BOLL", label: "Bollinger" },
  { value: "MACD", label: "MACD" },
  { value: "RSI", label: "RSI" },
  { value: "VOL", label: "Volume" },
] as const;

export const KLINE_DRAWING_OPTIONS = [
  { value: "horizontalStraightLine", label: "H-Line" },
  { value: "segment", label: "Trend" },
  { value: "rayLine", label: "Ray" },
  { value: "fibonacciLine", label: "Fib" },
  { value: "priceLine", label: "Price" },
] as const;

export function ohlcToKLineData(candle: OhlcCandle): KLineData {
  return {
    timestamp: toChartTime(candle.timestamp) * 1000,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume,
  };
}

export function ohlcListToKLineData(candles: OhlcCandle[]): KLineData[] {
  const sorted = [...candles].sort(
    (a, b) => toChartTime(a.timestamp) - toChartTime(b.timestamp),
  );
  const byTime = new Map<number, KLineData>();
  for (const candle of sorted) {
    const point = ohlcToKLineData(candle);
    byTime.set(point.timestamp, point);
  }
  return Array.from(byTime.values()).sort((a, b) => a.timestamp - b.timestamp);
}

export function chartIntervalToPeriod(interval: ChartInterval): Period {
  switch (interval) {
    case "1m":
      return { span: 1, type: "minute" };
    case "5m":
      return { span: 5, type: "minute" };
    case "15m":
      return { span: 15, type: "minute" };
    case "30m":
      return { span: 30, type: "minute" };
    case "1h":
      return { span: 1, type: "hour" };
    case "4h":
      return { span: 4, type: "hour" };
    case "1d":
      return { span: 1, type: "day" };
    default:
      return { span: 5, type: "minute" };
  }
}

export function getKLineChartStyles(isDark: boolean): DeepPartial<Styles> {
  const bg = isDark ? "#0a0a0a" : "#ffffff";
  const text = isDark ? "#a1a1aa" : "#71717a";
  const gridH = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
  const axisLine = isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)";
  const separator = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
  const up = isDark ? "#4ade80" : "#16a34a";
  const down = isDark ? "#f87171" : "#dc2626";

  return {
    grid: {
      show: true,
      horizontal: { show: true, color: gridH, style: "solid", size: 1 },
      vertical: { show: false },
    },
    separator: {
      color: separator,
      size: 1,
      fill: false,
    },
    candle: {
      type: "candle_solid",
      bar: {
        upColor: up,
        downColor: down,
        noChangeColor: up,
        upBorderColor: up,
        downBorderColor: down,
        noChangeBorderColor: up,
        upWickColor: up,
        downWickColor: down,
        noChangeWickColor: up,
      },
      priceMark: {
        last: {
          show: true,
          upColor: up,
          downColor: down,
          noChangeColor: up,
          line: { show: true, style: "solid", size: 1.5 },
          text: { show: true, color: bg, size: 12 },
        },
      },
      tooltip: { showRule: "follow_cross" },
    },
    xAxis: {
      axisLine: { show: true, color: axisLine },
      tickLine: { show: true, color: axisLine },
      tickText: { color: text },
    },
    yAxis: {
      axisLine: { show: true, color: axisLine },
      tickLine: { show: true, color: axisLine },
      tickText: { color: text },
    },
    crosshair: {
      horizontal: {
        line: { color: text, style: "dashed", dashedValue: [4, 4] },
        text: { color: bg, backgroundColor: text },
      },
      vertical: {
        line: { color: text, style: "dashed", dashedValue: [4, 4] },
        text: { color: bg, backgroundColor: text },
      },
    },
    indicator: {
      tooltip: { showRule: "follow_cross" },
    },
  };
}

export function alertOverlayId(alertId: string): string {
  return `${ALERT_OVERLAY_PREFIX}${alertId}`;
}

function alertLineColor(alert: Alert): string {
  return alert.condition === "below" ? "#f87171" : "#4ade80";
}

export function syncAlertOverlays(chart: Chart, alerts: Alert[]): void {
  const desired = new Set(
    alerts
      .filter((a) => a.alert_type === "price" && a.target_price !== null)
      .map((a) => alertOverlayId(a.id)),
  );

  for (const overlay of chart.getOverlays({ name: "priceLine" })) {
    if (!overlay.id?.startsWith(ALERT_OVERLAY_PREFIX)) {
      continue;
    }
    if (!desired.has(overlay.id)) {
      chart.removeOverlay({ id: overlay.id });
    }
  }

  for (const alert of alerts) {
    if (alert.alert_type !== "price" || alert.target_price === null) {
      continue;
    }
    const id = alertOverlayId(alert.id);
    const color = alertLineColor(alert);
    const existing = chart.getOverlays({ id });
    if (existing.length > 0) {
      chart.overrideOverlay({
        id,
        points: [{ value: alert.target_price }],
        styles: {
          line: { style: "dashed", color, size: 1, dashedValue: [6, 4] },
        },
      });
      continue;
    }
    chart.createOverlay({
      name: "priceLine",
      id,
      lock: true,
      points: [{ value: alert.target_price }],
      styles: {
        line: { style: "dashed", color, size: 1, dashedValue: [6, 4] },
      },
    });
  }
}

export function syncLivePriceOverlay(chart: Chart, price: number | undefined): void {
  if (typeof price !== "number" || !Number.isFinite(price)) {
    chart.removeOverlay({ id: LIVE_OVERLAY_ID });
    return;
  }

  const existing = chart.getOverlays({ id: LIVE_OVERLAY_ID });
  if (existing.length > 0) {
    chart.overrideOverlay({
      id: LIVE_OVERLAY_ID,
      points: [{ value: price }],
    });
    return;
  }

  chart.createOverlay({
    name: "priceLine",
    id: LIVE_OVERLAY_ID,
    lock: true,
    points: [{ value: price }],
    styles: {
      line: { style: "solid", color: "#ef4444", size: 2, dashedValue: [2, 2] },
    },
  });
}

export function mergedKLineData(
  closed: OhlcCandle[],
  forming: OhlcCandle | null | undefined,
): KLineData[] {
  return ohlcListToKLineData(mergeFormingCandle(closed, forming));
}

function upsertPriceLine(
  chart: Chart,
  id: string,
  value: number,
  color: string,
  size: number,
): void {
  const styles = {
    line: { style: "dashed" as const, color, size, dashedValue: [6, 4] },
  };
  if (chart.getOverlays({ id }).length > 0) {
    chart.overrideOverlay({ id, points: [{ value }], styles });
    return;
  }
  chart.createOverlay({
    name: "priceLine",
    id,
    lock: true,
    points: [{ value }],
    styles,
  });
}

export function syncTradeSetupLevels(
  chart: Chart,
  trade: { entry: number; sl: number; tp: number; sweep_level: number } | null,
  showSweepLevel = true,
): void {
  for (const id of [SETUP_ENTRY_OVERLAY_ID, SETUP_SL_OVERLAY_ID, SETUP_TP_OVERLAY_ID]) {
    chart.removeOverlay({ id });
  }
  if (!trade || !showSweepLevel) {
    chart.removeOverlay({ id: SETUP_SWEEP_OVERLAY_ID });
    return;
  }
  upsertPriceLine(chart, SETUP_SWEEP_OVERLAY_ID, trade.sweep_level, "#f59e0b", 1);
}

function upsertAnnotation(
  chart: Chart,
  id: string,
  timestamp: number,
  value: number,
  text: string,
  color: string,
): void {
  const points = [{ timestamp, value }];
  if (chart.getOverlays({ id }).length > 0) {
    chart.overrideOverlay({ id, points, extendData: text });
    return;
  }
  chart.createOverlay({
    name: "simpleAnnotation",
    id,
    lock: true,
    points,
    extendData: text,
    styles: {
      text: { color, size: 11 },
      line: { color, style: "dashed" },
    },
  });
}

export function syncEntryExitMarkers(
  chart: Chart,
  bars: KLineData[],
  trade: {
    time: string;
    exit_time: string | null;
    result: "win" | "loss" | "open" | "gap";
  } | null,
  nearestIndex: (timestampMs: number) => number,
  options?: {
    showEntry?: boolean;
    showExit?: boolean;
    entryLabel?: string;
  },
): void {
  const showEntry = options?.showEntry !== false;
  const showExit = options?.showExit !== false;
  const entryLabel = options?.entryLabel ?? "Entry";

  if (!trade || bars.length === 0) {
    chart.removeOverlay({ id: SETUP_ENTRY_MARK_ID });
    chart.removeOverlay({ id: SETUP_EXIT_MARK_ID });
    return;
  }

  const entryIndex = nearestIndex(new Date(trade.time).getTime());
  const entryBar = entryIndex >= 0 ? bars[entryIndex] : null;
  if (showEntry && entryBar) {
    upsertAnnotation(
      chart,
      SETUP_ENTRY_MARK_ID,
      entryBar.timestamp,
      entryBar.high,
      entryLabel,
      "#3b82f6",
    );
  } else {
    chart.removeOverlay({ id: SETUP_ENTRY_MARK_ID });
  }

  if (!showExit || !trade.exit_time || trade.result === "open") {
    chart.removeOverlay({ id: SETUP_EXIT_MARK_ID });
    return;
  }
  const exitIndex = nearestIndex(new Date(trade.exit_time).getTime());
  const exitBar = exitIndex >= 0 ? bars[exitIndex] : null;
  if (!exitBar) {
    chart.removeOverlay({ id: SETUP_EXIT_MARK_ID });
    return;
  }
  const isWin = trade.result === "win";
  const isGap = trade.result === "gap";
  upsertAnnotation(
    chart,
    SETUP_EXIT_MARK_ID,
    exitBar.timestamp,
    isWin ? exitBar.high : exitBar.low,
    isWin ? "Win" : isGap ? "Gap" : "Stop",
    isWin ? "#089981" : isGap ? "#a1a1aa" : "#F23645",
  );
}

export function syncSweepCandleTags(
  chart: Chart,
  bars: KLineData[],
  trade: {
    side: "bullish" | "bearish";
    sweep_level: number;
    sweep_time?: string | null;
  } | null,
  nearestIndex: (timestampMs: number) => number,
  show: boolean,
): void {
  if (!show || !trade?.sweep_time || bars.length === 0) {
    chart.removeOverlay({ id: SETUP_SWEEP_1H_MARK_ID });
    return;
  }
  const index = nearestIndex(new Date(trade.sweep_time).getTime());
  const bar = index >= 0 ? bars[index] : null;
  if (!bar) {
    chart.removeOverlay({ id: SETUP_SWEEP_1H_MARK_ID });
    return;
  }
  const isLow = trade.side === "bullish";
  upsertAnnotation(
    chart,
    SETUP_SWEEP_1H_MARK_ID,
    bar.timestamp,
    trade.sweep_level,
    isLow ? "1H low" : "1H high",
    "#f59e0b",
  );
}

/**
 * Draw the current-day previous-day-high/low levels as horizontal lines, with
 * the active draw-on-liquidity target emphasized.
 */
export function syncPrevDayLevels(
  chart: Chart,
  levels: { pdh: number; pdl: number; draw?: DrawTarget } | null,
): void {
  if (!levels || !Number.isFinite(levels.pdh) || !Number.isFinite(levels.pdl)) {
    chart.removeOverlay({ id: PDH_OVERLAY_ID });
    chart.removeOverlay({ id: PDL_OVERLAY_ID });
    return;
  }
  const draw = levels.draw ?? "none";
  upsertPriceLine(
    chart,
    PDH_OVERLAY_ID,
    levels.pdh,
    draw === "high" ? DRAW_ACTIVE_COLOR : PDH_COLOR,
    draw === "high" ? 2 : 1,
  );
  upsertPriceLine(
    chart,
    PDL_OVERLAY_ID,
    levels.pdl,
    draw === "low" ? DRAW_ACTIVE_COLOR : PDL_COLOR,
    draw === "low" ? 2 : 1,
  );
}

function outcomeColor(outcome: DayBias["outcome"]): string {
  switch (outcome) {
    case "displaced_up":
      return OUTCOME_DISPLACED_UP;
    case "displaced_down":
      return OUTCOME_DISPLACED_DOWN;
    case "reversal_from_high":
    case "reversal_from_low":
      return OUTCOME_REVERSAL;
    default:
      return OUTCOME_NEUTRAL;
  }
}

/**
 * Draw per-day PDH/PDL as horizontal segments spanning each day, colored by the
 * day's outcome. Used for the historical / backtest visualization.
 */
export function syncDrawHistory(chart: Chart, series: DayBias[]): void {
  for (const overlay of chart.getOverlays()) {
    if (overlay.id?.startsWith(DOL_SEGMENT_PREFIX)) {
      chart.removeOverlay({ id: overlay.id });
    }
  }

  for (let i = 0; i < series.length; i += 1) {
    const day = series[i];
    const startMs = new Date(day.date).getTime();
    if (!Number.isFinite(startMs)) {
      continue;
    }
    const endMs = startMs + DAY_MS;
    const color = outcomeColor(day.outcome);

    chart.createOverlay({
      name: "segment",
      id: `${DOL_SEGMENT_PREFIX}h-${i}`,
      lock: true,
      points: [
        { timestamp: startMs, value: day.pdh },
        { timestamp: endMs, value: day.pdh },
      ],
      styles: { line: { style: "solid", color: PDH_COLOR, size: 1 } },
    });
    chart.createOverlay({
      name: "segment",
      id: `${DOL_SEGMENT_PREFIX}l-${i}`,
      lock: true,
      points: [
        { timestamp: startMs, value: day.pdl },
        { timestamp: endMs, value: day.pdl },
      ],
      styles: { line: { style: "solid", color: PDL_COLOR, size: 1 } },
    });
    if (day.sweptHigh || day.sweptLow) {
      const markValue = day.sweptHigh ? day.pdh : day.pdl;
      chart.createOverlay({
        name: "simpleAnnotation",
        id: `${DOL_SEGMENT_PREFIX}m-${i}`,
        lock: true,
        points: [{ timestamp: startMs + DAY_MS / 2, value: markValue }],
        extendData: day.displaced ? "D" : "R",
        styles: { text: { color, size: 10 } },
      });
    }
  }
}

export function priceFromChartCoordinate(
  chart: Chart,
  x: number,
  y: number,
): number | null {
  const result = chart.convertFromPixel([{ x, y }]);
  const point = Array.isArray(result) ? result[0] : result;
  if (!point || typeof point.value !== "number" || !Number.isFinite(point.value)) {
    return null;
  }
  return point.value;
}
