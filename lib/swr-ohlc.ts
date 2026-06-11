import type { OhlcCandle } from "@/types/historical";

export function chartFormingSwrKey(pair: string, interval: string): string {
  return `chart-forming|${pair.replace(/[^a-z0-9]/gi, "").toUpperCase()}|${interval}`;
}

export function formingCandleDataEqual(
  a: OhlcCandle | null | undefined,
  b: OhlcCandle | null | undefined,
): boolean {
  if (a === b) {
    return true;
  }
  if (!a || !b) {
    return !a && !b;
  }
  return (
    a.timestamp === b.timestamp &&
    a.open === b.open &&
    a.high === b.high &&
    a.low === b.low &&
    a.close === b.close &&
    a.is_forming === b.is_forming
  );
}
