import type { Chart, OverlayCreate } from "klinecharts";
import type { FvgAlertPayload } from "@/types/fvg";
import { normalizeFvgTimeframe } from "@/types/fvg";

export const FVG_OVERLAY_PREFIX = "fx-fvg-";

const BULLISH_COLOR = "#22c55e";
const BEARISH_COLOR = "#ef4444";
const LABEL_TEXT = "#ffffff";

export function isFvgOverlayId(id?: string): boolean {
  if (!id) return false;
  return id.startsWith(FVG_OVERLAY_PREFIX);
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
    });
    return;
  }
  chart.createOverlay(create);
}

/**
 * Synchronizes active FVG zones to chart overlays for the currently viewed pair and interval.
 * Automatically prunes and removes overlays when switching timeframes or pairs.
 */
export function syncFvgOverlays(
  chart: Chart,
  zones: FvgAlertPayload[],
  currentPair: string,
  currentInterval: string,
  visible = true,
): void {
  const desired = new Set<string>();

  if (!visible) {
    removeOrphanPrefixed(chart, FVG_OVERLAY_PREFIX, desired);
    return;
  }

  const currentTf = normalizeFvgTimeframe(currentInterval);
  const normalizedPair = currentPair.replace(/[^a-z0-9]/gi, "").toUpperCase();

  const matchingZones = zones.filter((z) => {
    const zonePair = z.symbol.replace(/[^a-z0-9]/gi, "").toUpperCase();
    return zonePair === normalizedPair && z.timeframe === currentTf && z.status === "FORMED";
  });

  const nowMs = Date.now();

  for (const zone of matchingZones) {
    const isBull = zone.direction === "BULLISH";
    const color = isBull ? BULLISH_COLOR : BEARISH_COLOR;
    const startMs = zone.bar_time * 1000;
    // Extend boundary toward current time
    const endMs = Math.max(nowMs, startMs + 60_000);

    const topId = `${FVG_OVERLAY_PREFIX}top-${zone.id}`;
    const botId = `${FVG_OVERLAY_PREFIX}bot-${zone.id}`;
    const labelId = `${FVG_OVERLAY_PREFIX}lbl-${zone.id}`;

    desired.add(topId);
    desired.add(botId);
    desired.add(labelId);

    // Top boundary line
    upsertOverlay(chart, {
      name: "segment",
      id: topId,
      lock: true,
      points: [
        { timestamp: startMs, value: zone.top },
        { timestamp: endMs, value: zone.top },
      ],
      styles: {
        line: { style: "solid", color, size: 1.5 },
      },
    });

    // Bottom boundary line
    upsertOverlay(chart, {
      name: "segment",
      id: botId,
      lock: true,
      points: [
        { timestamp: startMs, value: zone.bottom },
        { timestamp: endMs, value: zone.bottom },
      ],
      styles: {
        line: { style: "solid", color, size: 1.5 },
      },
    });

    // Tag label
    const midPrice = (zone.top + zone.bottom) / 2;
    const labelText = `FVG ${isBull ? "Bull" : "Bear"} [${zone.bottom.toFixed(5)} - ${zone.top.toFixed(5)}]`;

    upsertOverlay(chart, {
      name: "simpleAnnotation",
      id: labelId,
      lock: true,
      points: [{ timestamp: startMs, value: midPrice }],
      extendData: labelText,
      styles: {
        text: {
          color: LABEL_TEXT,
          size: 10,
          backgroundColor: color,
          paddingLeft: 6,
          paddingRight: 6,
          paddingTop: 2,
          paddingBottom: 2,
          borderRadius: 4,
        },
      },
    });
  }

  removeOrphanPrefixed(chart, FVG_OVERLAY_PREFIX, desired);
}
