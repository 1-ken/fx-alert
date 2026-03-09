import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { API_ENDPOINTS } from "@/lib/constants";
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
  const [changeMap, setChangeMap] = useState<
    Record<string, { delta: number; deltaPercent: number }>
  >({});
  const previousBidMapRef = useRef<Map<string, number>>(new Map());

  const { data: clientConfig } = useObserverClientConfig();
  const snapshotSWR = useObserverSnapshot(fallbackEnabled);
  const { mutate: mutateSnapshot } = snapshotSWR;

  const wsUrl = useMemo(() => {
    if (clientConfig?.wsUrl) {
      return clientConfig.wsUrl;
    }

    return undefined;
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
      socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        reconnectAttempts = 0;
        setStatus("live");
        setFallbackEnabled(false);
      };

      socket.onmessage = async (event) => {
        try {
          const payload = JSON.parse(event.data) as StreamPayload;

          const nextChangeMap: Record<string, { delta: number; deltaPercent: number }> = {};

          for (const pair of payload.pairs) {
            const pairKey = pair.pair.toUpperCase();
            const previousBid = previousBidMapRef.current.get(pairKey);
            const delta = previousBid ? pair.bid - previousBid : 0;
            const deltaPercent = previousBid ? (delta / previousBid) * 100 : 0;

            nextChangeMap[pairKey] = { delta, deltaPercent };
            previousBidMapRef.current.set(pairKey, pair.bid);
          }

          setChangeMap(nextChangeMap);
          await mutateSnapshot(payload, { revalidate: false });
        } catch {
          // ignore malformed messages
        }
      };

      socket.onerror = () => {
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
        socket.close();
      }
    };
  }, [mutateSnapshot, wsUrl]);

  return {
    snapshot: snapshotSWR.data,
    snapshotError: snapshotSWR.error,
    isSnapshotLoading: snapshotSWR.isLoading,
    status,
    lastUpdatedAt: snapshotSWR.data?.ts ?? null,
    changeMap,
    refreshSnapshot: snapshotSWR.mutate,
  };
}
