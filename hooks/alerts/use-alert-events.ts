"use client";

import { useCallback } from "react";
import useSWR, { mutate as globalMutate, type SWRConfiguration } from "swr";
import { toast } from "sonner";
import { API_ENDPOINTS } from "@/lib/constants";
import { fetcher, SWR_LIST_OPTIONS } from "@/lib/swr-config";
import type { Alert, AlertEvent, AlertEventsResponse } from "@/types/alerts";

export const ALERT_EVENTS_KEY = `${API_ENDPOINTS.OBSERVER_PROXY.ALERT_EVENTS}?limit=500`;

export function markEventReadInList(
  data: AlertEventsResponse,
  eventId: string,
  readAt: string,
): AlertEventsResponse {
  let changed = false;
  const events = data.events.map((event) => {
    if (event.id !== eventId || event.read_at) return event;
    changed = true;
    return { ...event, read_at: readAt };
  });
  return {
    events,
    unread_count: changed ? Math.max(0, data.unread_count - 1) : data.unread_count,
  };
}

export function markAllEventsReadInList(
  data: AlertEventsResponse,
  readAt: string,
): AlertEventsResponse {
  return {
    events: data.events.map((event) => (event.read_at ? event : { ...event, read_at: readAt })),
    unread_count: 0,
  };
}

export function prependAlertEvent(
  current: AlertEventsResponse | undefined,
  event: AlertEvent,
): AlertEventsResponse {
  const base = current ?? { events: [], unread_count: 0 };
  if (base.events.some((item) => item.id === event.id)) return base;
  return {
    events: [event, ...base.events],
    unread_count: event.read_at ? base.unread_count : base.unread_count + 1,
  };
}

/** Keep a firing that the socket already showed when a refetch is still empty. */
export function mergeAlertEvents(
  current: AlertEventsResponse | undefined,
  incoming: AlertEventsResponse,
): AlertEventsResponse {
  const byId = new Map<string, AlertEvent>();
  for (const event of incoming.events) byId.set(event.id, event);
  for (const event of current?.events ?? []) {
    if (!byId.has(event.id)) byId.set(event.id, event);
  }
  const events = [...byId.values()].sort((a, b) => b.triggered_at.localeCompare(a.triggered_at));
  const unreadFromRows = events.filter((event) => !event.read_at).length;
  return {
    events,
    unread_count: Math.max(incoming.unread_count, unreadFromRows),
  };
}

const pendingFirings = new Map<string, AlertEvent>();

export function rememberFiredAlert(event: AlertEvent): void {
  pendingFirings.set(event.id, event);
}

export function alertEventFromFrame(payload: {
  event_id?: string;
  alert?: Alert & { user_id?: string; triggered_at?: string | null };
  current_price?: number;
  timeframe?: string;
  alert_type?: string;
}): AlertEvent | null {
  const alert = payload.alert;
  if (!payload.event_id || !alert?.id) return null;
  return {
    id: payload.event_id,
    user_id: alert.user_id ?? "",
    alert_id: alert.id,
    pair: alert.pair,
    alert_type: payload.alert_type || alert.alert_type,
    timeframe: payload.timeframe ?? alert.interval ?? "",
    price: typeof payload.current_price === "number" ? payload.current_price : 0,
    triggered_at: alert.triggered_at || new Date().toISOString(),
    read_at: null,
    data: alert,
  };
}

async function fetchAlertEvents(url: string): Promise<AlertEventsResponse> {
  const incoming = await fetcher<AlertEventsResponse>(url);
  for (const event of incoming.events) pendingFirings.delete(event.id);
  const pending = [...pendingFirings.values()];
  return mergeAlertEvents(
    pending.length > 0 ? { events: pending, unread_count: 0 } : undefined,
    incoming,
  );
}

export function noteAlertTriggered(payload: unknown): void {
  const frame =
    payload && typeof payload === "object"
      ? (payload as {
          event_id?: string;
          alert?: Alert & { user_id?: string; triggered_at?: string | null };
          current_price?: number;
          timeframe?: string;
          alert_type?: string;
        })
      : null;
  const event = frame ? alertEventFromFrame(frame) : null;
  if (!event) {
    void refreshAlertEvents();
    return;
  }
  rememberFiredAlert(event);
  void globalMutate(
    ALERT_EVENTS_KEY,
    (current: AlertEventsResponse | undefined) => prependAlertEvent(current, event),
    { revalidate: true },
  );
}

export function refreshAlertEvents(): Promise<unknown> {
  return globalMutate(
    (key) => typeof key === "string" && key.startsWith(API_ENDPOINTS.OBSERVER_PROXY.ALERT_EVENTS),
  );
}

export function useAlertEvents(options?: SWRConfiguration<AlertEventsResponse>) {
  const swr = useSWR<AlertEventsResponse>(ALERT_EVENTS_KEY, fetchAlertEvents, {
    ...SWR_LIST_OPTIONS,
    ...options,
  });
  const { data, mutate } = swr;

  const markRead = useCallback(
    async (eventId: string) => {
      const readAt = new Date().toISOString();
      await mutate(
        (current) => (current ? markEventReadInList(current, eventId, readAt) : current),
        { revalidate: false },
      );
      try {
        const response = await fetch(
          `${API_ENDPOINTS.OBSERVER_PROXY.ALERT_EVENTS}/${eventId}/read`,
          { method: "POST" },
        );
        if (!response.ok) throw new Error("Failed to mark alert as read");
      } catch (error) {
        await mutate();
        toast.error(error instanceof Error ? error.message : "Failed to mark alert as read");
      }
    },
    [mutate],
  );

  const markAllRead = useCallback(async () => {
    const readAt = new Date().toISOString();
    await mutate((current) => (current ? markAllEventsReadInList(current, readAt) : current), {
      revalidate: false,
    });
    try {
      const response = await fetch(`${API_ENDPOINTS.OBSERVER_PROXY.ALERT_EVENTS}/read-all`, {
        method: "POST",
      });
      if (!response.ok) throw new Error("Failed to mark alerts as read");
    } catch (error) {
      await mutate();
      toast.error(error instanceof Error ? error.message : "Failed to mark alerts as read");
    }
  }, [mutate]);

  return {
    events: data?.events ?? [],
    unreadCount: data?.unread_count ?? 0,
    isLoading: swr.isLoading,
    hasFetched: data !== undefined,
    error: swr.error as Error | undefined,
    refresh: mutate,
    markRead,
    markAllRead,
  };
}
