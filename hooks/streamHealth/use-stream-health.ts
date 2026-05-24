import useSWR from "swr";
import { API_ENDPOINTS } from "@/lib/constants";
import { fetcher, getSwrLoadState, SWR_LIST_OPTIONS } from "@/lib/swr-config";
import type { StreamHealth } from "@/types/streamHealth";

/**
 * Polls observer stream health on a background interval.
 */
export function useObserverHealth() {
  const swr = useSWR<StreamHealth>(API_ENDPOINTS.OBSERVER_PROXY.HEALTH, fetcher, {
    ...SWR_LIST_OPTIONS,
    refreshInterval: 30_000,
  });

  const { isInitialLoading, isRefreshing } = getSwrLoadState(swr);

  return {
    ...swr,
    isInitialLoading,
    isRefreshing,
    isLoading: isInitialLoading,
  };
}
