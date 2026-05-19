import useSWR from "swr";
import { API_ENDPOINTS } from "@/lib/constants";
import { fetcher } from "@/hooks/use-observer";

interface WsTokenResponse {
  wsUrl: string;
  accessToken: string;
}

export function useObserverWsToken() {
  return useSWR<WsTokenResponse>(API_ENDPOINTS.OBSERVER_PROXY.WS_TOKEN, fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
  });
}
