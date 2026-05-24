import useSWR from "swr";
import { API_ENDPOINTS } from "@/lib/constants";
import { fetcher, getSwrLoadState, SWR_LIST_OPTIONS } from "@/lib/swr-config";
import type { ServiceHealthResponse } from "@/types/historical";

/**
 * Polls upstream service health on a background interval.
 */
export function useObserverServiceHealth() {
  const swr = useSWR<ServiceHealthResponse>(
    API_ENDPOINTS.OBSERVER_PROXY.SERVICE_HEALTH,
    fetcher,
    {
      ...SWR_LIST_OPTIONS,
      refreshInterval: 60_000,
    },
  );

  const { isInitialLoading, isRefreshing } = getSwrLoadState(swr);

  return {
    ...swr,
    isInitialLoading,
    isRefreshing,
    isLoading: isInitialLoading,
  };
}
