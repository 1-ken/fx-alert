import { useSession } from "next-auth/react";
import { useBootstrap } from "@/components/bootstrap-provider";
import { getObserverWebSocketUrl } from "@/lib/constants";

interface WsTokenResponse {
  wsUrl: string;
  accessToken: string;
}

/**
 * Builds WebSocket URL and access token from session + bootstrap cache.
 */
export function useObserverWsToken() {
  const { data: session } = useSession();
  const { bootstrap, isInitialLoading } = useBootstrap();

  const data = bootstrap && session?.accessToken
    ? {
        wsUrl: bootstrap.wsUrl?.trim() || getObserverWebSocketUrl(),
        accessToken: session.accessToken,
      }
    : undefined;

  return {
    data: data as WsTokenResponse | undefined,
    isLoading: isInitialLoading || !bootstrap,
    error: null,
  };
}
