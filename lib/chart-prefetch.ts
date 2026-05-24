import { mutate } from "swr";
import { API_ENDPOINTS } from "@/lib/constants";
import { fetcher } from "@/lib/swr-config";
import type { ChartInterval } from "@/lib/chart-utils";

function buildOhlcKey(pair: string, interval: ChartInterval, limit: number): string {
  const search = new URLSearchParams({
    pair,
    interval,
    limit: String(limit),
  });
  return `${API_ENDPOINTS.OBSERVER_PROXY.HISTORICAL_OHLC}?${search.toString()}`;
}

/**
 * Warms SWR cache for a pair's closed OHLC candles (dashboard hover / navigation).
 */
export function prefetchPairOhlc(
  pair: string,
  interval: ChartInterval = "5m",
  limit = 80,
): void {
  const key = buildOhlcKey(pair, interval, limit);
  void mutate(key, fetcher(key), { revalidate: false });
}
