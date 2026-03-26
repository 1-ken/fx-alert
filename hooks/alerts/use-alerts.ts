import { useCallback } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { API_ENDPOINTS } from "@/lib/constants";
import { fetcher } from "@/hooks/use-observer";
import type {
  Alert,
  AlertUpsertInput,
  AlertUpsertResponse,
  AlertsResponse,
} from "@/types/alerts";

function normalizeAlert(rawAlert: unknown): Alert | null {
  if (!rawAlert || typeof rawAlert !== "object") {
    return null;
  }

  const record = rawAlert as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id : null;
  const pair = typeof record.pair === "string" ? record.pair : null;

  if (!id || !pair) {
    return null;
  }

  return {
    id,
    pair,
    target_price:
      typeof record.target_price === "number" ? record.target_price : Number(record.target_price ?? 0),
    condition:
      record.condition === "above" || record.condition === "below" || record.condition === "equal"
        ? record.condition
        : "equal",
    status:
      record.status === "active" || record.status === "triggered" || record.status === "disabled"
        ? record.status
        : "active",
    channel: record.channel === "email" || record.channel === "sms" || record.channel === "call" ? record.channel : "email",
    email: typeof record.email === "string" ? record.email : "",
    phone: typeof record.phone === "string" ? record.phone : "",
    custom_message: typeof record.custom_message === "string" ? record.custom_message : "",
    created_at: typeof record.created_at === "string" ? record.created_at : "",
    triggered_at: typeof record.triggered_at === "string" ? record.triggered_at : null,
    last_checked_price:
      typeof record.last_checked_price === "number"
        ? record.last_checked_price
        : Number(record.last_checked_price ?? 0),
  };
}

function normalizeAlertArray(value: unknown): Alert[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((alert) => normalizeAlert(alert))
    .filter((alert): alert is Alert => alert !== null);
}

export function normalizeAlertsResponse(payload: unknown): AlertsResponse {
  if (!payload || typeof payload !== "object") {
    return {
      total: 0,
      active: [],
      triggered: [],
      all: [],
    };
  }

  const record = payload as Record<string, unknown>;
  const active = normalizeAlertArray(record.active);
  const triggered = normalizeAlertArray(record.triggered);
  const all = normalizeAlertArray(record.all);
  const mergedAll = all.length > 0 ? all : [...active, ...triggered];
  const total = typeof record.total === "number" ? record.total : mergedAll.length;

  return {
    total,
    active,
    triggered,
    all: mergedAll,
  };
}

export function useObserverAlerts() {
  const { data, error, isLoading, mutate } = useSWR<unknown>(
    API_ENDPOINTS.OBSERVER_PROXY.ALERTS,
    fetcher,
    {
      revalidateOnFocus: false,
    }
  );

  const alerts = normalizeAlertsResponse(data);
  const hasFetched = data !== undefined;

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
      const optimistic = hasFetched
        ? {
            ...alerts,
            active: alerts.active.filter((alert) => alert.id !== alertId),
            triggered: alerts.triggered.filter((alert) => alert.id !== alertId),
            all: alerts.all.filter((alert) => alert.id !== alertId),
            total: alerts.total > 0 ? alerts.total - 1 : 0,
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
    [alerts, hasFetched, mutate]
  );

  return {
    alerts,
    isLoading,
    error,
    mutate,
    createAlert,
    deleteAlert,
  };
}
