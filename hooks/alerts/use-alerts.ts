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

  const alertType: AlertType =
    record.alert_type === "candle_close"
      ? "candle_close"
      : record.alert_type === "prev_day_level"
        ? "prev_day_level"
        : record.alert_type === "market_structure"
          ? "market_structure"
          : "price";
  const levelRef =
    record.level_ref === "high" || record.level_ref === "low" || record.level_ref === "both"
      ? record.level_ref
      : null;
  const dolTrigger =
    record.dol_trigger === "sweep" ||
    record.dol_trigger === "displacement" ||
    record.dol_trigger === "reversal" ||
    record.dol_trigger === "draw_met"
      ? record.dol_trigger
      : null;
  const structureEvent =
    record.structure_event === "bos" ||
    record.structure_event === "choch" ||
    record.structure_event === "sweep" ||
    record.structure_event === "any"
      ? record.structure_event
      : null;
  const structureDirection =
    record.structure_direction === "bull" ||
    record.structure_direction === "bear" ||
    record.structure_direction === "any"
      ? record.structure_direction
      : null;
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
      record.status === "active" ||
      record.status === "waiting" ||
      record.status === "triggered" ||
      record.status === "disabled" ||
      record.status === "expired"
        ? record.status
        : "active",
    channel: (() => {
      const rawChannels = Array.isArray(record.channels)
        ? record.channels.filter(
            (value): value is Alert["channel"] =>
              value === "email" ||
              value === "sms" ||
              value === "call" ||
              value === "sound",
          )
        : [];
      if (rawChannels.length > 0) return rawChannels[0];
      return record.channel === "email" ||
        record.channel === "sms" ||
        record.channel === "call" ||
        record.channel === "sound"
        ? record.channel
        : "email";
    })(),
    ...(Array.isArray(record.channels)
      ? {
          channels: record.channels.filter(
            (value): value is Alert["channel"] =>
              value === "email" ||
              value === "sms" ||
              value === "call" ||
              value === "sound",
          ),
        }
      : {}),
    email: typeof record.email === "string" ? record.email : "",
    phone: typeof record.phone === "string" ? record.phone : "",
    custom_message: typeof record.custom_message === "string" ? record.custom_message : "",
    created_at: typeof record.created_at === "string" ? record.created_at : "",
    triggered_at: typeof record.triggered_at === "string" ? record.triggered_at : null,
    expires_at: typeof record.expires_at === "string" ? record.expires_at : null,
    last_checked_price: toNullableNumber(record.last_checked_price),
    level_ref: levelRef,
    dol_trigger: dolTrigger,
    batch_id: typeof record.batch_id === "string" ? record.batch_id : null,
    structure_event: structureEvent,
    structure_direction: structureDirection,
    min_swing_atr: toNullableNumber(record.min_swing_atr),
    break_k: toNullableNumber(record.break_k),
    depends_on_alert_id:
      typeof record.depends_on_alert_id === "string" ? record.depends_on_alert_id : null,
    chain_id: typeof record.chain_id === "string" ? record.chain_id : null,
    sequence_index:
      typeof record.sequence_index === "number" && Number.isFinite(record.sequence_index)
        ? record.sequence_index
        : null,
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
      waiting: [],
      triggered: [],
      expired: [],
      all: [],
    };
  }

  const record = payload as Record<string, unknown>;
  const active = normalizeAlertArray(record.active);
  const waiting = normalizeAlertArray(record.waiting);
  const triggered = normalizeAlertArray(record.triggered);
  const expired = normalizeAlertArray(record.expired);
  const all = normalizeAlertArray(record.all);
  const mergedAll =
    all.length > 0 ? all : [...active, ...waiting, ...triggered, ...expired];
  const resolvedWaiting =
    waiting.length > 0
      ? waiting
      : mergedAll.filter((alert) => alert.status === "waiting");
  const resolvedExpired =
    expired.length > 0 ? expired : mergedAll.filter((alert) => alert.status === "expired");
  const total = typeof record.total === "number" ? record.total : mergedAll.length;

  return {
    total,
    active,
    waiting: resolvedWaiting,
    triggered,
    expired: resolvedExpired,
    all: mergedAll,
  };
}

function toCachePayload(response: AlertsResponse): Record<string, unknown> {
  return {
    total: response.total,
    active: response.active,
    waiting: response.waiting,
    triggered: response.triggered,
    expired: response.expired,
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
    ...(input.channels !== undefined ? { channels: input.channels } : {}),
    ...(input.email !== undefined ? { email: input.email } : {}),
    ...(input.phone !== undefined ? { phone: input.phone } : {}),
    ...(input.custom_message !== undefined ? { custom_message: input.custom_message } : {}),
    ...(input.expires_at !== undefined ? { expires_at: input.expires_at } : {}),
    ...(input.structure_event !== undefined ? { structure_event: input.structure_event } : {}),
    ...(input.structure_direction !== undefined
      ? { structure_direction: input.structure_direction }
      : {}),
    ...(input.min_swing_atr !== undefined ? { min_swing_atr: input.min_swing_atr } : {}),
    ...(input.break_k !== undefined ? { break_k: input.break_k } : {}),
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
    waiting: mapList(current.waiting),
    triggered: mapList(current.triggered),
    expired: mapList(current.expired),
    all: mapList(current.all),
  });
}

function appendAlertToCache(cache: unknown, alert: Alert): Record<string, unknown> {
  const current = normalizeAlertsResponse(cache);
  const isWaiting = alert.status === "waiting";
  const active = isWaiting ? current.active : [...current.active, alert];
  const waiting = isWaiting ? [...current.waiting, alert] : current.waiting;
  const all = [...current.all, alert];

  return toCachePayload({
    total: current.total + 1,
    active,
    waiting,
    triggered: current.triggered,
    expired: current.expired,
    all,
  });
}

function removeAlertFromCache(cache: unknown, alertId: string): Record<string, unknown> {
  const current = normalizeAlertsResponse(cache);
  const filter = (list: Alert[]) => list.filter((alert) => alert.id !== alertId);

  return toCachePayload({
    total: current.total > 0 ? current.total - 1 : 0,
    active: filter(current.active),
    waiting: filter(current.waiting),
    triggered: filter(current.triggered),
    expired: filter(current.expired),
    all: filter(current.all),
  });
}

function buildOptimisticAlert(input: AlertUpsertInput): Alert {
  const dependsOn = input.depends_on_alert_id?.trim() || null;
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
    status: dependsOn ? "waiting" : "active",
    channel: input.channels?.[0] ?? input.channel ?? "email",
    channels: input.channels ?? (input.channel ? [input.channel] : ["email"]),
    email: input.email ?? "",
    phone: input.phone ?? "",
    custom_message: input.custom_message ?? "",
    created_at: new Date().toISOString(),
    triggered_at: null,
    expires_at: input.expires_at ?? null,
    last_checked_price: null,
    level_ref: input.level_ref ?? null,
    dol_trigger: input.dol_trigger ?? null,
    batch_id: null,
    structure_event: input.structure_event ?? null,
    structure_direction: input.structure_direction ?? null,
    min_swing_atr: input.min_swing_atr ?? null,
    break_k: input.break_k ?? null,
    depends_on_alert_id: dependsOn,
    chain_id: null,
    sequence_index: dependsOn ? 1 : 0,
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
            active: optimisticAlert.status === "waiting" ? [] : [optimisticAlert],
            waiting: optimisticAlert.status === "waiting" ? [optimisticAlert] : [],
            triggered: [],
            expired: [],
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
    hasFetched,
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
