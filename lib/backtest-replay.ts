import type { KLineData } from "klinecharts";
import type { BacktestTrade } from "@/types/analytics";

export const REPLAY_CONTEXT_BARS = 8;

export const REPLAY_SPEEDS = {
  "1x": 400,
  "2x": 200,
  "4x": 100,
} as const;

export type ReplaySpeed = keyof typeof REPLAY_SPEEDS;

export function nearestBarIndex(
  bars: Array<Pick<KLineData, "timestamp">>,
  timestampMs: number,
): number {
  if (bars.length === 0 || !Number.isFinite(timestampMs)) {
    return -1;
  }
  if (timestampMs <= bars[0].timestamp) {
    return 0;
  }
  let index = 0;
  for (let i = 0; i < bars.length; i += 1) {
    if (bars[i].timestamp <= timestampMs) {
      index = i;
    } else {
      break;
    }
  }
  return index;
}

export function replayRange(
  bars: Array<Pick<KLineData, "timestamp">>,
  trade: Pick<BacktestTrade, "time" | "exit_time">,
  contextBars: number = REPLAY_CONTEXT_BARS,
): { start: number; entry: number; end: number } | null {
  const entryTs = new Date(trade.time).getTime();
  const entry = nearestBarIndex(bars, entryTs);
  if (entry < 0) {
    return null;
  }
  const exitTs = trade.exit_time ? new Date(trade.exit_time).getTime() : Number.NaN;
  const end = Number.isFinite(exitTs)
    ? Math.max(entry, nearestBarIndex(bars, exitTs))
    : bars.length - 1;
  const start = Math.max(0, entry - contextBars);
  return { start, entry, end };
}

export function isoToChartTimestamp(iso: string): number {
  return new Date(iso).getTime();
}
