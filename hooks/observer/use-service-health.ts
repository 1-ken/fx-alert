import useSWR from "swr";
import { API_ENDPOINTS } from "@/lib/constants";
import { fetcher } from "@/hooks/use-observer";
import type { ServiceHealthResponse } from "@/types/historical";

export function useObserverServiceHealth() {
  return useSWR<ServiceHealthResponse>(API_ENDPOINTS.OBSERVER_PROXY.SERVICE_HEALTH, fetcher, {
    revalidateOnFocus: false,
    refreshInterval: 60_000,
  });
}
