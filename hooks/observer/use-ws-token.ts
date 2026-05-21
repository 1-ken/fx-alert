import { useSession } from "next-auth/react";
import { useBootstrap } from "@/components/bootstrap-provider";
import { getObserverWebSocketUrl } from "@/lib/constants";

interface WsTokenResponse {
  wsUrl: string;
  accessToken: string;
}

export function useObserverWsToken() {
  const { data: session } = useSession();
  const { bootstrap, isLoading } = useBootstrap();

  // Return data in the expected format
  const data = bootstrap && session?.accessToken
    ? {
        wsUrl: bootstrap.wsUrl?.trim() || getObserverWebSocketUrl(),
        accessToken: session.accessToken,
      }
    : undefined;

  return {
    data: data as WsTokenResponse | undefined,
    isLoading: isLoading || !bootstrap,
    error: null,
  };
}
