import { useEffect, useMemo, useRef, useState } from "react";
import {
  EXPLICIT_OBSERVER_WS_URL,
  normalizeObserverWebSocketUrl,
} from "@/lib/constants";
import { useObserverClientConfig } from "@/hooks/use-observer";
import {
  normalizeMarketSnapshot,
  useObserverSnapshot,
} from "@/hooks/snapshot/use-snapshot";
import type { StreamPayload } from "@/types/snapshot";

export function useObserverStream() {
  const [status, setStatus] = useState<"live" | "reconnecting" | "offline">("reconnecting");
  const [fallbackEnabled, setFallbackEnabled] = useState<boolean>(false);
  const [lastStreamTickAt, setLastStreamTickAt] = useState<string | null>(null);
  const [changeMap, setChangeMap] = useState<
    Record<string, { delta: number; deltaPercent: number }>
  >({});
  const previousPriceMapRef = useRef<Map<string, number>>(new Map());

  const { data: clientConfig } = useObserverClientConfig();
  const snapshotSWR = useObserverSnapshot(fallbackEnabled);
  const { mutate: mutateSnapshot } = snapshotSWR;
  const normalizedSnapshot = useMemo(
    () => normalizeMarketSnapshot(snapshotSWR.data),
    [snapshotSWR.data]
  );

  const wsUrl = useMemo(() => {
    if (EXPLICIT_OBSERVER_WS_URL) {
      return normalizeObserverWebSocketUrl(EXPLICIT_OBSERVER_WS_URL);
    }

    return normalizeObserverWebSocketUrl(clientConfig?.wsUrl);
  }, [clientConfig?.wsUrl]);

  useEffect(() => {
    if (!wsUrl) {
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
        socket.close();
      }

      setStatus(reconnectAttempts === 0 ? "reconnecting" : "offline");
      console.log(`[WebSocket] Connecting to ${wsUrl}...`);
      socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        reconnectAttempts = 0;
        setStatus("live");
        setFallbackEnabled(false);
        console.log(`[WebSocket] ✅ Connected to ${wsUrl}`);
      };

      socket.onmessage = async (event) => {
        try {
          const payload = JSON.parse(event.data) as StreamPayload;
          const normalizedPayload = normalizeMarketSnapshot(payload);

          if (!normalizedPayload) {
            console.warn("[WebSocket] ⚠️ Received invalid payload");
            return;
          }

          console.log(
            `[WebSocket] 📊 Stream update: ${normalizedPayload.pairs.length} pairs, market ${normalizedPayload.market_status}`
          );

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
        } catch (error) {
          console.error("[WebSocket] ❌ Failed to process message:", error);
        }
      };

      socket.onerror = (error) => {
        console.error("[WebSocket] ❌ Connection error:", error);
        setStatus("offline");
        setFallbackEnabled(true);
      };

      socket.onclose = (event) => {
        if (isClosed) {
          return;
        }

        console.log(
          `[WebSocket] 🔌 Disconnected (code: ${event.code}, reason: ${event.reason || "none"})`
        );
        setStatus("offline");
        setFallbackEnabled(true);

        const delay = Math.min(1_000 * 2 ** reconnectAttempts, 8_000);
        reconnectAttempts += 1;
        console.log(`[WebSocket] 🔄 Reconnecting in ${delay}ms (attempt ${reconnectAttempts})...`);
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
        socket.close();
      }
    };
  }, [mutateSnapshot, wsUrl]);

  return {
    snapshot: normalizedSnapshot,
    snapshotError: snapshotSWR.error,
    isSnapshotLoading: snapshotSWR.isLoading,
    status,
    lastUpdatedAt: normalizedSnapshot?.ts ?? null,
    lastStreamTickAt,
    changeMap,
    refreshSnapshot: snapshotSWR.mutate,
  };
}
