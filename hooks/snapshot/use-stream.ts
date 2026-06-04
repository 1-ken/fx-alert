import { useEffect, useMemo, useRef, useState } from "react";
import { mutate as globalMutate } from "swr";
import {
  API_ENDPOINTS,
  EXPLICIT_OBSERVER_WS_URL,
  getObserverWebSocketUrl,
  normalizeObserverWebSocketUrl,
} from "@/lib/constants";
import { useObserverWsToken } from "@/hooks/observer/use-ws-token";
import {
  normalizeAlertsResponse,
  useObserverAlerts,
} from "@/hooks/alerts/use-alerts";
import {
  normalizeMarketSnapshot,
  useObserverSnapshot,
} from "@/hooks/snapshot/use-snapshot";
import type { StreamPayload } from "@/types/snapshot";

/**
 * Live market stream via WebSocket with SWR snapshot/alert cache updates.
 */
export function useObserverStream() {
  const [status, setStatus] = useState<"live" | "reconnecting" | "offline">("reconnecting");
  const [fallbackEnabled, setFallbackEnabled] = useState<boolean>(false);
  const [lastStreamTickAt, setLastStreamTickAt] = useState<string | null>(null);
  const [changeMap, setChangeMap] = useState<
    Record<string, { delta: number; deltaPercent: number }>
  >({});
  const previousPriceMapRef = useRef<Map<string, number>>(new Map());

  const { data: wsTokenData, isLoading: isWsTokenLoading } = useObserverWsToken();
  const snapshotSWR = useObserverSnapshot(fallbackEnabled);
  const { mutate: mutateSnapshot } = snapshotSWR;
  const { alerts } = useObserverAlerts();

  const normalizedSnapshot = useMemo(
    () => normalizeMarketSnapshot(snapshotSWR.data),
    [snapshotSWR.data],
  );

  const wsUrl = useMemo(() => {
    const accessToken = wsTokenData?.accessToken;
    if (!accessToken) {
      return null;
    }

    let baseUrl: string | null = null;

    if (EXPLICIT_OBSERVER_WS_URL) {
      baseUrl = normalizeObserverWebSocketUrl(EXPLICIT_OBSERVER_WS_URL);
    } else if (wsTokenData?.wsUrl?.trim()) {
      baseUrl = normalizeObserverWebSocketUrl(wsTokenData.wsUrl);
    } else {
      baseUrl = getObserverWebSocketUrl();
    }

    const separator = baseUrl.includes("?") ? "&" : "?";
    return `${baseUrl}${separator}access_token=${encodeURIComponent(accessToken)}`;
  }, [wsTokenData]);

  useEffect(() => {
    if (!wsUrl || isWsTokenLoading) {
      return;
    }

    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempts = 0;
    let isClosed = false;

    const connect = () => {
      if (isClosed) {
        return;
      }

      if (socket) {
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CLOSING) {
          socket.close();
        }
      }

      setStatus(reconnectAttempts === 0 ? "reconnecting" : "offline");
      socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        reconnectAttempts = 0;
        setStatus("live");
        setFallbackEnabled(false);
      };

      socket.onmessage = async (event) => {
        if (isClosed) {
          return;
        }

        try {
          const payload = JSON.parse(event.data) as StreamPayload;
          const normalizedPayload = normalizeMarketSnapshot(payload);
          const normalizedAlerts = normalizeAlertsResponse(payload.alerts);

          if (!normalizedPayload) {
            return;
          }

          setLastStreamTickAt(normalizedPayload.ts ?? new Date().toISOString());

          const nextChangeMap: Record<string, { delta: number; deltaPercent: number }> = {};

          for (const pair of normalizedPayload.pairs) {
            const pairKey = pair.pair.toUpperCase();
            const previousPrice = previousPriceMapRef.current.get(pairKey);
            const delta = previousPrice ? pair.price - previousPrice : 0;
            const deltaPercent = previousPrice ? (delta / previousPrice) * 100 : 0;

            nextChangeMap[pairKey] = { delta, deltaPercent };
            previousPriceMapRef.current.set(pairKey, pair.price);
          }

          setChangeMap(nextChangeMap);
          await mutateSnapshot(normalizedPayload, { revalidate: false });
          await globalMutate(
            API_ENDPOINTS.OBSERVER_PROXY.ALERTS,
            {
              total: normalizedAlerts.total,
              active: normalizedAlerts.active,
              triggered: normalizedAlerts.triggered,
              all: normalizedAlerts.all,
            },
            { revalidate: false },
          );
        } catch (error) {
          console.error("[WebSocket] Failed to process message:", error);
        }
      };

      socket.onerror = () => {
        if (isClosed) {
          return;
        }

        setStatus("offline");
        setFallbackEnabled(true);
      };

      socket.onclose = () => {
        if (isClosed) {
          return;
        }

        setStatus("offline");
        setFallbackEnabled(true);

        const delay = Math.min(1_000 * 2 ** reconnectAttempts, 8_000);
        reconnectAttempts += 1;
        reconnectTimer = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      isClosed = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;

        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CLOSING) {
          socket.close();
        }
      }
    };
  }, [isWsTokenLoading, mutateSnapshot, wsUrl]);

  return {
    snapshot: normalizedSnapshot,
    alerts,
    snapshotError: snapshotSWR.error,
    isSnapshotLoading: snapshotSWR.isInitialLoading,
    isSnapshotRefreshing: snapshotSWR.isRefreshing,
    status,
    lastUpdatedAt: normalizedSnapshot?.ts ?? null,
    lastStreamTickAt,
    changeMap,
    refreshSnapshot: snapshotSWR.mutate,
  };
}
