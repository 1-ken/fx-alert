import useSWR from "swr";
import { API_ENDPOINTS } from "@/lib/constants";
import { fetcher, SWR_STATIC_OPTIONS } from "@/lib/swr-config";
import type { ClientConfig } from "@/types/observer";

export { fetcher } from "@/lib/swr-config";

/**
 * Loads observer client config (WebSocket URL hints) with long-lived cache.
 */
export function useObserverClientConfig() {
  return useSWR<ClientConfig>(
    API_ENDPOINTS.OBSERVER_PROXY.CLIENT_CONFIG,
    fetcher,
    SWR_STATIC_OPTIONS,
  );
}
