import { registerOverlay, type Chart, type OverlayFigure } from "klinecharts";
import type { BacktestTrade } from "@/types/analytics";
import type { ChartLabelVisibility } from "@/lib/chart-label-visibility";
import {
  computePositionLabels,
  TRADE_POSITION_OVERLAY_ID,
  TRADE_POSITION_OVERLAY_NAME,
  type PositionLabels,
} from "@/lib/position-math";

export {
  TRADE_POSITION_OVERLAY_ID,
  TRADE_POSITION_OVERLAY_NAME,
  computePositionLabels,
  pipSizeForPair,
  pricePrecisionForPair,
} from "@/lib/position-math";

const TV_GREEN = "#089981";
const TV_RED = "#F23645";
const TARGET_FILL = "rgba(8, 153, 129, 0.22)";
const STOP_FILL = "rgba(242, 54, 69, 0.22)";
const CENTER_NEUTRAL = "rgba(24, 24, 27, 0.88)";

let registered = false;

function textFigure(
  x: number,
  y: number,
  text: string,
  backgroundColor: string,
): OverlayFigure {
  return {
    type: "text",
    attrs: { x, y, text, align: "center", baseline: "middle" },
    styles: {
      color: "#ffffff",
      size: 11,
      family: "sans-serif",
      backgroundColor,
      paddingLeft: 6,
      paddingRight: 6,
      paddingTop: 3,
      paddingBottom: 3,
      borderRadius: 4,
    },
    ignoreEvent: true,
  };
}

function centerBackground(labels: PositionLabels): string {
  if (labels.pnlPositive === true) {
    return TV_GREEN;
  }
  if (labels.pnlPositive === false) {
    return TV_RED;
  }
  return CENTER_NEUTRAL;
}

export function ensureTradePositionOverlay(): void {
  if (registered) {
    return;
  }
  registered = true;
  try {
    registerOverlay<PositionLabels>({
      name: TRADE_POSITION_OVERLAY_NAME,
      totalStep: 3,
      needDefaultPointFigure: false,
      lock: true,
      createPointFigures: ({ overlay, coordinates }) => {
        if (coordinates.length < 3) {
          return [];
        }
        const entry = coordinates[0];
        const target = coordinates[1];
        const stop = coordinates[2];
        const left = Math.min(entry.x, target.x, stop.x);
        const right = Math.max(entry.x, target.x, stop.x);
        const width = Math.max(right - left, 12);
        const labels: PositionLabels = overlay.extendData ?? {
          targetLabel: "Target",
          stopLabel: "Stop",
          centerLabel: "Entry",
          pnlPositive: null,
          showTarget: true,
          showStop: true,
          showCenter: true,
        };

        const targetTop = Math.min(entry.y, target.y);
        const targetHeight = Math.max(Math.abs(target.y - entry.y), 2);
        const stopTop = Math.min(entry.y, stop.y);
        const stopHeight = Math.max(Math.abs(stop.y - entry.y), 2);
        const midX = left + width / 2;

        const figures: OverlayFigure[] = [
          {
            type: "rect",
            attrs: { x: left, y: targetTop, width, height: targetHeight },
            styles: { color: TARGET_FILL, borderSize: 0 },
            ignoreEvent: true,
          },
          {
            type: "rect",
            attrs: { x: left, y: stopTop, width, height: stopHeight },
            styles: { color: STOP_FILL, borderSize: 0 },
            ignoreEvent: true,
          },
          {
            type: "line",
            attrs: {
              coordinates: [
                { x: left, y: entry.y },
                { x: left + width, y: entry.y },
              ],
            },
            styles: { color: "#e4e4e7", size: 1, style: "dashed", dashedValue: [4, 4] },
            ignoreEvent: true,
          },
        ];
        if (labels.showTarget) {
          figures.push(
            textFigure(
              midX,
              targetTop + targetHeight / 2,
              labels.targetLabel,
              TV_GREEN,
            ),
          );
        }
        if (labels.showStop) {
          figures.push(
            textFigure(midX, stopTop + stopHeight / 2, labels.stopLabel, TV_RED),
          );
        }
        if (labels.showCenter) {
          figures.push(
            textFigure(midX, entry.y, labels.centerLabel, centerBackground(labels)),
          );
        }
        return figures;
      },
    });
  } catch {
    // Overlay already registered (hot reload).
  }
}

export function syncTradePositionOverlay(
  chart: Chart,
  pair: string,
  trade: BacktestTrade | null,
  span: { startTs: number; endTs: number } | null,
  lastClose?: number,
  visibility?: Pick<ChartLabelVisibility, "target" | "stop" | "center">,
): void {
  ensureTradePositionOverlay();
  if (!trade || !span) {
    chart.removeOverlay({ id: TRADE_POSITION_OVERLAY_ID });
    return;
  }

  const labels = computePositionLabels(pair, trade, lastClose, visibility);
  const points = [
    { timestamp: span.startTs, value: trade.entry },
    { timestamp: span.endTs, value: trade.tp },
    { timestamp: span.endTs, value: trade.sl },
  ];

  if (chart.getOverlays({ id: TRADE_POSITION_OVERLAY_ID }).length > 0) {
    chart.overrideOverlay({
      id: TRADE_POSITION_OVERLAY_ID,
      points,
      extendData: labels,
    });
    return;
  }

  chart.createOverlay({
    name: TRADE_POSITION_OVERLAY_NAME,
    id: TRADE_POSITION_OVERLAY_ID,
    lock: true,
    points,
    extendData: labels,
  });
}
