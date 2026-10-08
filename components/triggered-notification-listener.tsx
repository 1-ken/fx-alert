"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { SWRConfiguration } from "swr";
import { useAlertEvents } from "@/hooks/alerts/use-alert-events";
import { useAlertSound } from "@/hooks/alerts/use-alert-sound";
import { useNotificationCenter } from "@/hooks/alerts/use-notification-center";
import { showAlertOsNotification } from "@/lib/alert-sound";
import { notificationCenter } from "@/lib/notification-center";
import { formatKenyaRelative } from "@/lib/datetime";
import {
  formatAlertTypeLabel,
  formatEventPair,
} from "@/components/alerts/alert-event-detail-dialog";
import { buildTriggeredChartUrl } from "@/lib/instrument-navigation";
import type { AlertEventsResponse } from "@/types/alerts";

const TRIGGERED_ALERTS_HREF = "/alerts/list?status=triggered";

/** Catch firings missed by the stream (e.g. while the tab slept) when the user comes back. */
const EVENTS_POLL_OPTIONS: SWRConfiguration<AlertEventsResponse> = {
  revalidateOnFocus: true,
  refreshInterval: 60_000,
};

function subscribe(callback: () => void): () => void {
  return notificationCenter.subscribe(callback);
}

function getToastSnapshot(): number {
  return notificationCenter.peekToasts().length + notificationCenter.peekSummaryCount();
}

function getServerSnapshot(): number {
  return 0;
}

const TOAST_CLASS =
  "flex w-full min-w-70 cursor-pointer flex-col gap-1 rounded-lg border border-border bg-background p-4 text-left shadow-lg";

/**
 * Alert firings from the persisted event log: FIFO sound playback and LIFO sonner toasts
 * (newest first), including unread firings since the last visit. When the tab is hidden,
 * shows an OS desktop notification instead of an in-app toast.
 */
export function TriggeredNotificationListener() {
  const router = useRouter();
  const { events, hasFetched, markRead } = useAlertEvents(EVENTS_POLL_OPTIONS);
  const { popNextToast } = useNotificationCenter(events, hasFetched);
  const toastCount = useSyncExternalStore(subscribe, getToastSnapshot, getServerSnapshot);
  const shownToastKeysRef = useRef<Set<string>>(new Set());

  useAlertSound(hasFetched);

  useEffect(() => {
    if (!hasFetched || toastCount === 0) {
      return;
    }

    const summaryCount = notificationCenter.takeSummaryCount();
    if (summaryCount > 0) {
      toast.custom(
        (toastId) => (
          <button
            type="button"
            className={TOAST_CLASS}
            onClick={() => {
              toast.dismiss(toastId);
              router.push(TRIGGERED_ALERTS_HREF);
            }}
          >
            <span className="text-sm font-semibold text-foreground">
              {summaryCount} new alerts triggered
            </span>
            <span className="text-xs text-muted-foreground">
              Open the bell to see each one, or tap to view triggered alerts.
            </span>
            <span className="mt-1 text-xs font-medium text-primary">View</span>
          </button>
        ),
        { duration: 10_000 },
      );
    }

    let item = popNextToast();
    while (item) {
      if (!shownToastKeysRef.current.has(item.triggerKey)) {
        shownToastKeysRef.current.add(item.triggerKey);
        const eventId = item.eventId;
        const href = buildTriggeredChartUrl({
          pair: item.pair,
          alertType: item.alertType,
          interval: item.alert.interval,
          intervals: item.alert.intervals,
          candleTime: item.alert.last_evaluated_candle_time,
          triggeredAt: item.triggeredAt,
          price: item.alert.last_checked_price,
        });
        const pairLabel = formatEventPair(item.pair);
        const description = `${formatAlertTypeLabel(item.alertType)} · ${formatKenyaRelative(item.triggeredAt)}`;
        const tabHidden =
          typeof document !== "undefined" && document.visibilityState === "hidden";

        if (tabHidden) {
          showAlertOsNotification({
            title: `Alert triggered: ${pairLabel}`,
            body: description,
            tag: item.triggerKey,
            href,
          });
        } else {
          toast.custom(
            (toastId) => (
              <button
                type="button"
                className={TOAST_CLASS}
                onClick={() => {
                  toast.dismiss(toastId);
                  void markRead(eventId);
                  router.push(href);
                }}
              >
                <span className="text-sm font-semibold text-foreground">
                  Alert triggered: {pairLabel}
                </span>
                <span className="text-xs text-muted-foreground">{description}</span>
                <span className="mt-1 text-xs font-medium text-primary">View</span>
              </button>
            ),
            { duration: 8_000 },
          );
        }
      }
      item = popNextToast();
    }
  }, [hasFetched, markRead, popNextToast, router, toastCount]);

  return null;
}
