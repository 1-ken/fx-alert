import useSWR from "swr";
import { API_ENDPOINTS } from "@/lib/constants";
import { fetcher } from "@/hooks/use-observer";
import type {
  HistoricalPricesResponse,
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

export function useHistoricalPrices(params: {
  pair?: string;
  start?: string;
  end?: string;
  limit?: number;
  order?: string;
}) {
  const key = buildQueryUrl(API_ENDPOINTS.OBSERVER_PROXY.HISTORICAL, params);
  return useSWR<HistoricalPricesResponse>(key, fetcher, { revalidateOnFocus: false });
}

export function useHistoricalOhlc(params: {
  pair: string;
  interval?: string;
  start?: string;
  end?: string;
  limit?: number;
}) {
  const key = params.pair
    ? buildQueryUrl(API_ENDPOINTS.OBSERVER_PROXY.HISTORICAL_OHLC, params)
    : null;
  return useSWR<OhlcResponse>(key, fetcher, { revalidateOnFocus: false });
}

export function useHistoricalStreamMetrics(params: {
  start?: string;
  end?: string;
  limit?: number;
  order?: string;
}) {
  const key = buildQueryUrl(API_ENDPOINTS.OBSERVER_PROXY.HISTORICAL_STREAM_METRICS, params);
  return useSWR<StreamMetricsResponse>(key, fetcher, { revalidateOnFocus: false });
}

export function useHistoricalOhlcWithForming(params: {
  pair: string;
  interval?: string;
  start?: string;
  end?: string;
  limit?: number;
}) {
  const key = params.pair
    ? buildQueryUrl(API_ENDPOINTS.OBSERVER_PROXY.HISTORICAL_OHLC_WITH_FORMING, params)
    : null;
  return useSWR<OhlcWithFormingResponse>(key, fetcher, { revalidateOnFocus: false });
}
