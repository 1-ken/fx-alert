import type { Chart, OverlayCreate } from "klinecharts";
import { toChartTime } from "@/lib/chart-utils";
import type { OhlcCandle } from "@/types/historical";
import type { Alert } from "@/types/alerts";
import {
  ATR_ZONE_K,
  type MarketStructureResult,
  type StructureEvent,
} from "@/lib/market-structure";

export const STRUCTURE_OVERLAY_PREFIX = "fx-structure-";
export const STRUCTURE_ALERT_OVERLAY_PREFIX = "fx-structure-alert-";

/** @deprecated Prefer directionColor — kept for any external imports. */
export const STRUCTURE_BREAK_COLOR = { BOS: "#16a34a", CHoCH: "#dc2626", SWEEP: "#16a34a" };
const LEVEL_HIGH = "#ff8a8a";
const LEVEL_LOW = "#5fd4a0";
const ATR_COLOR = "#64748b";
const BULL_COLOR = "#16a34a";
const BEAR_COLOR = "#dc2626";
const LABEL_TEXT = "#ffffff";
const WAITING_MUTED = "#94a3b8";

function directionColor(dir: string | undefined): string {
  return dir === "bear" ? BEAR_COLOR : BULL_COLOR;
}

function labelTextStyles(accent: string, size = 11) {
  return {
    text: {
      color: LABEL_TEXT,
      size,
      backgroundColor: accent,
      paddingLeft: 6,
      paddingRight: 6,
      paddingTop: 2,
      paddingBottom: 2,
      borderRadius: 4,
    },
  };
}

export type StructureLayerFlags = {
  levels: boolean;
  breaks: boolean;
  sweeps: boolean;
  atrZone: boolean;
  pdhPdl: boolean;
  alertLines: boolean;
  pendingStructureAlerts: boolean;
};

export const DEFAULT_STRUCTURE_LAYERS: StructureLayerFlags = {
  levels: true,
  breaks: true,
  sweeps: true,
  atrZone: false,
  pdhPdl: true,
  alertLines: true,
  pendingStructureAlerts: true,
};

function tsMs(iso: string): number {
  return toChartTime(iso) * 1000;
}

function candleTs(candles: OhlcCandle[], index: number): number | null {
  const c = candles[index];
  if (!c) {
    return null;
  }
  return tsMs(c.timestamp);
}

function removeOrphanPrefixed(chart: Chart, prefix: string, desired: Set<string>): void {
  for (const overlay of chart.getOverlays()) {
    if (overlay.id?.startsWith(prefix) && !desired.has(overlay.id)) {
      chart.removeOverlay({ id: overlay.id });
    }
  }
}

function upsertOverlay(chart: Chart, create: OverlayCreate): void {
  const id = create.id;
  if (!id) {
    chart.createOverlay(create);
    return;
  }
  if (chart.getOverlays({ id }).length > 0) {
    chart.overrideOverlay({
      id,
      points: create.points,
      styles: create.styles,
      extendData: create.extendData,
      lock: create.lock,
      onClick: create.onClick,
    });
    return;
  }
  chart.createOverlay(create);
}

export function isStructureOverlayId(id?: string): boolean {
  if (!id) {
    return false;
  }
  return id.startsWith(STRUCTURE_OVERLAY_PREFIX) || id.startsWith(STRUCTURE_ALERT_OVERLAY_PREFIX);
}

export function syncMarketStructureOverlays(
  chart: Chart,
  result: MarketStructureResult | null,
  candles: OhlcCandle[],
  flags: StructureLayerFlags,
  onEventClick?: (event: StructureEvent) => void,
): void {
  const desired = new Set<string>();
  if (!result) {
    removeOrphanPrefixed(chart, STRUCTURE_OVERLAY_PREFIX, desired);
    return;
  }

  const closed = candles.filter((c) => !c.is_forming);

  if (flags.levels) {
    for (const pivot of result.pivots) {
      const start = tsMs(pivot.timestamp);
      const endIndex = pivot.brokenAt ?? closed.length - 1;
      const end = candleTs(closed, endIndex) ?? start;
      const color = pivot.type === "high" ? LEVEL_HIGH : LEVEL_LOW;
      const dashed = pivot.broken;
      const id = `${STRUCTURE_OVERLAY_PREFIX}level-${pivot.type}-${pivot.index}`;
      desired.add(id);
      upsertOverlay(chart, {
        name: "segment",
        id,
        lock: true,
        points: [
          { timestamp: start, value: pivot.price },
          { timestamp: end, value: pivot.price },
        ],
        styles: {
          line: {
            style: dashed ? "dashed" : "solid",
            color,
            size: dashed ? 1 : 1.5,
            dashedValue: [6, 4],
          },
        },
      });
    }
  }

  if (flags.breaks) {
    for (let i = 0; i < result.events.length; i += 1) {
      const ev = result.events[i];
      if (ev.kind === "SWEEP") {
        continue;
      }
      const color = directionColor(ev.dir);
      const id = `${STRUCTURE_OVERLAY_PREFIX}break-${i}`;
      const labelId = `${STRUCTURE_OVERLAY_PREFIX}break-label-${i}`;
      desired.add(id);
      desired.add(labelId);
      upsertOverlay(chart, {
        name: "segment",
        id,
        lock: true,
        points: [
          { timestamp: tsMs(ev.fromTimestamp), value: ev.level },
          { timestamp: tsMs(ev.timestamp), value: ev.level },
        ],
        styles: {
          line: { style: "dashed", color, size: 1.6, dashedValue: [6, 4] },
        },
        onClick: () => {
          onEventClick?.(ev);
          return true;
        },
      });
      upsertOverlay(chart, {
        name: "simpleAnnotation",
        id: labelId,
        lock: true,
        points: [{ timestamp: tsMs(ev.timestamp), value: ev.level }],
        extendData: ev.kind,
        styles: labelTextStyles(color, 11),
        onClick: () => {
          onEventClick?.(ev);
          return true;
        },
      });
    }
  }

  if (flags.sweeps) {
    for (let i = 0; i < result.events.length; i += 1) {
      const ev = result.events[i];
      if (ev.kind !== "SWEEP") {
        continue;
      }
      const color = directionColor(ev.dir);
      const label = `SWEEP ${ev.level.toFixed(ev.level >= 100 ? 2 : 5)}`;
      const id = `${STRUCTURE_OVERLAY_PREFIX}sweep-${i}`;
      const lineId = `${STRUCTURE_OVERLAY_PREFIX}sweep-line-${i}`;
      desired.add(id);
      desired.add(lineId);
      upsertOverlay(chart, {
        name: "simpleAnnotation",
        id,
        lock: true,
        points: [{ timestamp: tsMs(ev.timestamp), value: ev.wick ?? ev.level }],
        extendData: label,
        styles: labelTextStyles(color, 10),
        onClick: () => {
          onEventClick?.(ev);
          return true;
        },
      });
      upsertOverlay(chart, {
        name: "segment",
        id: lineId,
        lock: true,
        points: [
          { timestamp: tsMs(ev.fromTimestamp), value: ev.level },
          { timestamp: tsMs(ev.timestamp), value: ev.level },
        ],
        styles: {
          line: { style: "dashed", color, size: 1.2, dashedValue: [2, 3] },
        },
      });
    }
  }

  if (flags.atrZone && result.lastAtr != null) {
    const last = result.lastHigh ?? result.lastLow;
    if (last) {
      const half = result.lastAtr * ATR_ZONE_K;
      const hiId = `${STRUCTURE_OVERLAY_PREFIX}atr-hi`;
      const loId = `${STRUCTURE_OVERLAY_PREFIX}atr-lo`;
      desired.add(hiId);
      desired.add(loId);
      upsertOverlay(chart, {
        name: "priceLine",
        id: hiId,
        lock: true,
        points: [{ value: last.price + half }],
        styles: {
          line: { style: "dashed", color: ATR_COLOR, size: 1, dashedValue: [4, 4] },
        },
      });
      upsertOverlay(chart, {
        name: "priceLine",
        id: loId,
        lock: true,
        points: [{ value: last.price - half }],
        styles: {
          line: { style: "dashed", color: ATR_COLOR, size: 1, dashedValue: [4, 4] },
        },
      });
    }
  }

  removeOrphanPrefixed(chart, STRUCTURE_OVERLAY_PREFIX, desired);
}

function structureAlertLabel(alert: Alert): string {
  const ev = (alert.structure_event ?? "any").toUpperCase();
  const dir = alert.structure_direction ?? "any";
  const tf = alert.interval ?? "";
  const step =
    typeof alert.sequence_index === "number" ? ` · #${alert.sequence_index + 1}` : "";
  if (alert.status === "waiting") {
    return `Queued ${tf} ${dir} ${ev}${step}`;
  }
  return `Waiting ${tf} ${dir} ${ev}${step}`;
}

export function syncPendingStructureAlertOverlays(
  chart: Chart,
  alerts: Alert[],
  lastPrice: number | undefined,
  visible: boolean,
): void {
  const desired = new Set<string>();
  if (!visible) {
    removeOrphanPrefixed(chart, STRUCTURE_ALERT_OVERLAY_PREFIX, desired);
    return;
  }
  const pending = alerts.filter(
    (a) =>
      a.alert_type === "market_structure" &&
      (a.status === "active" || a.status === "waiting"),
  );
  for (const alert of pending) {
    const value = alert.threshold ?? lastPrice;
    if (typeof value !== "number" || !Number.isFinite(value)) {
      continue;
    }
    const id = `${STRUCTURE_ALERT_OVERLAY_PREFIX}${alert.id}`;
    desired.add(id);
    const muted = alert.status === "waiting";
    const accent = muted
      ? WAITING_MUTED
      : directionColor(alert.structure_direction ?? undefined);
    upsertOverlay(chart, {
      name: "simpleAnnotation",
      id,
      lock: true,
      points: [{ value }],
      extendData: structureAlertLabel(alert),
      styles: muted
        ? { text: { color: WAITING_MUTED, size: 10 } }
        : labelTextStyles(accent, 10),
    });
  }
  removeOrphanPrefixed(chart, STRUCTURE_ALERT_OVERLAY_PREFIX, desired);
}
