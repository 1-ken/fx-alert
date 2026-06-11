import useSWR from "swr";
import { API_ENDPOINTS } from "@/lib/constants";
import {
  fetcher,
  getSwrLoadState,
  SWR_HISTORICAL_CHART_CLOSED_OPTIONS,
  SWR_HISTORICAL_FORMING_MOBILE_OPTIONS,
  SWR_HISTORICAL_FORMING_OPTIONS,
  SWR_HISTORICAL_OPTIONS,
} from "@/lib/swr-config";
import type {
  OhlcResponse,
  OhlcWithFormingResponse,
  StreamMetricsResponse,
} from "@/types/historical";

function buildQueryUrl(base: string, params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      search.set(key, String(value));
    }
  }
  const query = search.toString();
  return query ? `${base}?${query}` : base;
}

function withLoadState<T extends { data: unknown; error: unknown; isLoading: boolean; isValidating: boolean }>(
  swr: T,
) {
  const { isInitialLoading, isRefreshing } = getSwrLoadState(swr);
  return {
    ...swr,
    isInitialLoading,
    isRefreshing,
    isLoading: isInitialLoading,
  };
}

export function chartClosedOhlcKey(params: {
  pair: string;
  interval?: string;
  start?: string;
  end?: string;
  limit?: number;
}): string | null {
  return params.pair
    ? buildQueryUrl(API_ENDPOINTS.OBSERVER_PROXY.HISTORICAL_OHLC, params)
    : null;
}

/**
 * Closed OHLC candles for charting.
 */
export function useHistoricalOhlc(
  params: {
    pair: string;
    interval?: string;
    start?: string;
    end?: string;
    limit?: number;
  },
  options?: { chartClosed?: boolean },
) {
  const key = chartClosedOhlcKey(params);
  const swrOptions = options?.chartClosed
    ? SWR_HISTORICAL_CHART_CLOSED_OPTIONS
    : SWR_HISTORICAL_OPTIONS;
  const swr = useSWR<OhlcResponse>(key, fetcher, swrOptions);
  return withLoadState(swr);
}

/**
 * Stream health metrics history.
 */
export function useHistoricalStreamMetrics(params: {
  start?: string;
  end?: string;
  limit?: number;
  order?: string;
}) {
  const key = buildQueryUrl(API_ENDPOINTS.OBSERVER_PROXY.HISTORICAL_STREAM_METRICS, params);
  const swr = useSWR<StreamMetricsResponse>(key, fetcher, SWR_HISTORICAL_OPTIONS);
  return withLoadState(swr);
}

/**
 * OHLC candles including the in-progress forming candle (background refresh).
 */
export function useHistoricalOhlcWithForming(
  params: {
    pair: string;
    interval?: string;
    start?: string;
    end?: string;
    limit?: number;
  },
  options?: { mobileRefresh?: boolean },
) {
  const key = params.pair
    ? buildQueryUrl(API_ENDPOINTS.OBSERVER_PROXY.HISTORICAL_OHLC_WITH_FORMING, params)
    : null;
  const swrOptions = options?.mobileRefresh
    ? SWR_HISTORICAL_FORMING_MOBILE_OPTIONS
    : SWR_HISTORICAL_FORMING_OPTIONS;
  const swr = useSWR<OhlcWithFormingResponse>(key, fetcher, swrOptions);
  return withLoadState(swr);
}
