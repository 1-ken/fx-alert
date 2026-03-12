import useSWR from "swr";
import { API_ENDPOINTS } from "@/lib/constants";
import { fetcher } from "@/hooks/use-observer";
import type { StreamHealth } from "@/types/streamHealth";

export function useObserverHealth() {
  return useSWR<StreamHealth>(API_ENDPOINTS.OBSERVER_PROXY.HEALTH, fetcher, {
    revalidateOnFocus: false,
    refreshInterval: 30_000,
  });
}
