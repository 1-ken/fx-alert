"use client";

import { useCallback } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import { toast } from "sonner";
import { API_ENDPOINTS } from "@/lib/constants";
import { fetcher, SWR_LIST_OPTIONS } from "@/lib/swr-config";
import type { AlertEventsResponse } from "@/types/alerts";

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

export function refreshAlertEvents(): Promise<unknown> {
  return globalMutate(
    (key) => typeof key === "string" && key.startsWith(API_ENDPOINTS.OBSERVER_PROXY.ALERT_EVENTS),
  );
}

export function useAlertEvents() {
  const swr = useSWR<AlertEventsResponse>(ALERT_EVENTS_KEY, fetcher, SWR_LIST_OPTIONS);
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
    markRead,
    markAllRead,
  };
}
