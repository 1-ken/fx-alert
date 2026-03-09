import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import {
  API_ENDPOINTS,
  EXPLICIT_OBSERVER_WS_URL,
  normalizeObserverWebSocketUrl,
} from "@/lib/constants";
import type {
  Alert,
  AlertUpsertInput,
  AlertUpsertResponse,
  AlertsResponse,
  ClientConfig,
  MarketSnapshot,
  StreamHealth,
  StreamPayload,
} from "@/types/observer";

function normalizePairSymbol(pair: string): string {
  const compactPair = pair.replace(/[^a-z]/gi, "").toUpperCase();

  if (compactPair.length === 6) {
    return `${compactPair.slice(0, 3)}/${compactPair.slice(3)}`;
  }

  return pair.trim().toUpperCase();
}

function parseNumericValue(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, "").trim());
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function normalizeMarketSnapshot(payload: unknown): MarketSnapshot | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const rawPairs = Array.isArray(record.pairs) ? record.pairs : [];

  const pairs = rawPairs
    .map((rawPair) => {
      if (!rawPair || typeof rawPair !== "object") {
        return null;
      }

      const pairRecord = rawPair as Record<string, unknown>;
      const pair = typeof pairRecord.pair === "string" ? pairRecord.pair : null;

      if (!pair) {
        return null;
      }

      const bid = parseNumericValue(pairRecord.bid);
      const ask = parseNumericValue(pairRecord.ask);
      const spread = parseNumericValue(pairRecord.spread);
      const price =
        parseNumericValue(pairRecord.price) ?? bid ?? ask ?? null;

      if (price === null) {
        return null;
      }

      return {
        pair: normalizePairSymbol(pair),
        price,
        ...(bid !== null ? { bid } : {}),
        ...(ask !== null ? { ask } : {}),
        ...(spread !== null ? { spread } : {}),
      };
    })
    .filter((pair): pair is MarketSnapshot["pairs"][number] => pair !== null);

  const marketStatus = record.market_status === "open" ? "open" : "closed";
  const ts = typeof record.ts === "string" ? record.ts : new Date().toISOString();

  return {
    market_status: marketStatus,
    pairs,
    ts,
  };
}

const fetcher = async <T>(url: string): Promise<T> => {
  const response = await fetch(url);

  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || "Request failed");
  }

  return response.json() as Promise<T>;
};

export function useObserverClientConfig() {
  return useSWR<ClientConfig>(API_ENDPOINTS.OBSERVER_PROXY.CLIENT_CONFIG, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });
}

export function useObserverSnapshot(enablePolling: boolean) {
  return useSWR<MarketSnapshot>(API_ENDPOINTS.OBSERVER_PROXY.SNAPSHOT, fetcher, {
    revalidateOnFocus: false,
    refreshInterval: enablePolling ? 5_000 : 0,
  });
}

export function useObserverHealth() {
  return useSWR<StreamHealth>(API_ENDPOINTS.OBSERVER_PROXY.HEALTH, fetcher, {
    revalidateOnFocus: false,
    refreshInterval: 30_000,
  });
}

export function useObserverAlerts() {
  const { data, error, isLoading, mutate } = useSWR<AlertsResponse>(
    API_ENDPOINTS.OBSERVER_PROXY.ALERTS,
    fetcher,
    {
      revalidateOnFocus: false,
    }
  );

  const createAlert = useCallback(
    async (input: AlertUpsertInput): Promise<Alert | null> => {
      const response = await fetch(API_ENDPOINTS.OBSERVER_PROXY.ALERTS, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(body || "Failed to create alert");
      }

      const payload = (await response.json()) as AlertUpsertResponse;
      await mutate();
      toast.success("Alert created successfully");
      return payload.alert;
    },
    [mutate]
  );

  const deleteAlert = useCallback(
    async (alertId: string): Promise<void> => {
      const optimistic = data
        ? {
            ...data,
            active: data.active.filter((alert) => alert.id !== alertId),
            triggered: data.triggered.filter((alert) => alert.id !== alertId),
            all: data.all.filter((alert) => alert.id !== alertId),
            total: data.total > 0 ? data.total - 1 : 0,
          }
        : undefined;

      await mutate(optimistic, { revalidate: false });

      const response = await fetch(`${API_ENDPOINTS.OBSERVER_PROXY.ALERTS}/${alertId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        await mutate();
        const body = await response.text();
        throw new Error(body || "Failed to delete alert");
      }

      await mutate();
      toast.success("Alert deleted");
    },
    [data, mutate]
  );

  return {
    alerts: data,
    isLoading,
    error,
    mutate,
    createAlert,
    deleteAlert,
  };
}

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
            console.warn('[WebSocket] ⚠️ Received invalid payload');
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
          console.error('[WebSocket] ❌ Failed to process message:', error);
        }
      };

      socket.onerror = (error) => {
        console.error('[WebSocket] ❌ Connection error:', error);
        setStatus("offline");
        setFallbackEnabled(true);
      };

      socket.onclose = (event) => {
        if (isClosed) {
          return;
        }

        console.log(`[WebSocket] 🔌 Disconnected (code: ${event.code}, reason: ${event.reason || 'none'})`);
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
