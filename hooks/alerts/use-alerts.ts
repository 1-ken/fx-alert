import { useCallback } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { API_ENDPOINTS } from "@/lib/constants";
import { generateId } from "@/lib/id";
import { fetcher, getSwrLoadState, SWR_LIST_OPTIONS } from "@/lib/swr-config";
import type {
  Alert,
  AlertCondition,
  AlertType,
  AlertUpsertInput,
  AlertUpsertResponse,
  AlertsResponse,
  CandleDirection,
} from "@/types/alerts";

function toNullableNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, "").trim());
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

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

  const alertType: AlertType = record.alert_type === "candle_close" ? "candle_close" : "price";
  const condition: AlertCondition | null =
    record.condition === "above" || record.condition === "below" || record.condition === "equal"
      ? record.condition
      : null;
  const direction: CandleDirection | null =
    record.direction === "above" || record.direction === "below" ? record.direction : null;

  return {
    id,
    pair,
    alert_type: alertType,
    target_price: toNullableNumber(record.target_price),
    condition,
    interval: typeof record.interval === "string" ? record.interval : null,
    direction,
    threshold: toNullableNumber(record.threshold),
    last_evaluated_candle_time:
      typeof record.last_evaluated_candle_time === "string"
        ? record.last_evaluated_candle_time
        : null,
    status:
      record.status === "active" || record.status === "triggered" || record.status === "disabled"
        ? record.status
        : "active",
    channel:
      record.channel === "email" ||
      record.channel === "sms" ||
      record.channel === "call" ||
      record.channel === "sound"
        ? record.channel
        : "email",
    email: typeof record.email === "string" ? record.email : "",
    phone: typeof record.phone === "string" ? record.phone : "",
    custom_message: typeof record.custom_message === "string" ? record.custom_message : "",
    created_at: typeof record.created_at === "string" ? record.created_at : "",
    triggered_at: typeof record.triggered_at === "string" ? record.triggered_at : null,
    last_checked_price: toNullableNumber(record.last_checked_price),
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

function toCachePayload(response: AlertsResponse): Record<string, unknown> {
  return {
    total: response.total,
    active: response.active,
    triggered: response.triggered,
    all: response.all,
  };
}

function applyAlertPatch(alert: Alert, input: Partial<AlertUpsertInput>): Alert {
  return {
    ...alert,
    ...(input.pair !== undefined ? { pair: input.pair } : {}),
    ...(input.alert_type !== undefined ? { alert_type: input.alert_type } : {}),
    ...(input.target_price !== undefined ? { target_price: input.target_price } : {}),
    ...(input.condition !== undefined ? { condition: input.condition } : {}),
    ...(input.interval !== undefined ? { interval: input.interval } : {}),
    ...(input.direction !== undefined ? { direction: input.direction } : {}),
    ...(input.threshold !== undefined ? { threshold: input.threshold } : {}),
    ...(input.channel !== undefined ? { channel: input.channel } : {}),
    ...(input.email !== undefined ? { email: input.email } : {}),
    ...(input.phone !== undefined ? { phone: input.phone } : {}),
    ...(input.custom_message !== undefined ? { custom_message: input.custom_message } : {}),
  };
}

function patchAlertsCache(
  cache: unknown,
  alertId: string,
  patch: Partial<AlertUpsertInput>,
): Record<string, unknown> | undefined {
  const current = normalizeAlertsResponse(cache);
  const target = current.all.find((alert) => alert.id === alertId);
  if (!target) {
    return undefined;
  }

  const updated = applyAlertPatch(target, patch);
  const mapList = (list: Alert[]) =>
    list.map((alert) => (alert.id === alertId ? updated : alert));

  return toCachePayload({
    ...current,
    active: mapList(current.active),
    triggered: mapList(current.triggered),
    all: mapList(current.all),
  });
}

function appendAlertToCache(cache: unknown, alert: Alert): Record<string, unknown> {
  const current = normalizeAlertsResponse(cache);
  const active = [...current.active, alert];
  const all = [...current.all, alert];

  return toCachePayload({
    total: current.total + 1,
    active,
    triggered: current.triggered,
    all,
  });
}

function removeAlertFromCache(cache: unknown, alertId: string): Record<string, unknown> {
  const current = normalizeAlertsResponse(cache);
  const filter = (list: Alert[]) => list.filter((alert) => alert.id !== alertId);

  return toCachePayload({
    total: current.total > 0 ? current.total - 1 : 0,
    active: filter(current.active),
    triggered: filter(current.triggered),
    all: filter(current.all),
  });
}

function buildOptimisticAlert(input: AlertUpsertInput): Alert {
  return {
    id: `optimistic-${generateId()}`,
    pair: input.pair,
    alert_type: input.alert_type ?? "price",
    target_price: input.target_price ?? null,
    condition: input.condition ?? null,
    interval: input.interval ?? null,
    direction: input.direction ?? null,
    threshold: input.threshold ?? null,
    last_evaluated_candle_time: null,
    status: "active",
    channel: input.channel ?? "email",
    email: input.email ?? "",
    phone: input.phone ?? "",
    custom_message: input.custom_message ?? "",
    created_at: new Date().toISOString(),
    triggered_at: null,
    last_checked_price: null,
  };
}

/**
 * Loads and mutates user alerts with SWR caching and optimistic updates.
 */
export function useObserverAlerts() {
  const swr = useSWR<unknown>(
    API_ENDPOINTS.OBSERVER_PROXY.ALERTS,
    fetcher,
    SWR_LIST_OPTIONS,
  );

  const { data, error, isLoading, isValidating, mutate } = swr;
  const { isInitialLoading, isRefreshing } = getSwrLoadState({
    data,
    error,
    isLoading,
    isValidating,
  });

  const alerts = normalizeAlertsResponse(data);
  const hasFetched = data !== undefined;

  const createAlert = useCallback(
    async (input: AlertUpsertInput): Promise<Alert | null> => {
      const optimisticAlert = buildOptimisticAlert(input);
      const optimisticCache = hasFetched
        ? appendAlertToCache(data, optimisticAlert)
        : toCachePayload({
            total: 1,
            active: [optimisticAlert],
            triggered: [],
            all: [optimisticAlert],
          });

      await mutate(optimisticCache, { revalidate: false });

      try {
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
      } catch (createError) {
        await mutate();
        throw createError;
      }
    },
    [data, hasFetched, mutate],
  );

  const deleteAlert = useCallback(
    async (alertId: string): Promise<void> => {
      const optimistic = hasFetched ? removeAlertFromCache(data, alertId) : undefined;

      await mutate(optimistic, { revalidate: false });

      try {
        const response = await fetch(`${API_ENDPOINTS.OBSERVER_PROXY.ALERTS}/${alertId}`, {
          method: "DELETE",
        });

        if (!response.ok) {
          const body = await response.text();
          throw new Error(body || "Failed to delete alert");
        }

        await mutate();
        toast.success("Alert deleted");
      } catch (deleteError) {
        await mutate();
        throw deleteError;
      }
    },
    [data, hasFetched, mutate],
  );

  const updateAlert = useCallback(
    async (
      alertId: string,
      input: Partial<AlertUpsertInput>,
      options?: { silent?: boolean },
    ): Promise<Alert | null> => {
      const optimistic = hasFetched ? patchAlertsCache(data, alertId, input) : undefined;

      if (optimistic) {
        await mutate(optimistic, { revalidate: false });
      }

      try {
        const response = await fetch(`${API_ENDPOINTS.OBSERVER_PROXY.ALERTS}/${alertId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(input),
        });

        if (!response.ok) {
          const body = await response.text();
          throw new Error(body || "Failed to update alert");
        }

        const payload = (await response.json()) as AlertUpsertResponse;
        await mutate();
        if (!options?.silent) {
          toast.success("Alert updated");
        }
        return payload.alert;
      } catch (updateError) {
        await mutate();
        throw updateError;
      }
    },
    [data, hasFetched, mutate],
  );

  return {
    alerts,
    isLoading: isInitialLoading,
    isInitialLoading,
    isRefreshing,
    error,
    mutate,
    createAlert,
    updateAlert,
    deleteAlert,
  };
}

/**
 * Loads a single alert by id with SWR caching.
 */
export function useObserverAlert(alertId: string | null) {
  const key = alertId ? `${API_ENDPOINTS.OBSERVER_PROXY.ALERTS}/${alertId}` : null;

  const swr = useSWR<unknown>(key, fetcher, SWR_LIST_OPTIONS);
  const { isInitialLoading, isRefreshing } = getSwrLoadState(swr);
  const alert = normalizeAlert(swr.data);

  return {
    alert,
    isLoading: isInitialLoading,
    isInitialLoading,
    isRefreshing,
    error: swr.error,
    mutate: swr.mutate,
  };
}
