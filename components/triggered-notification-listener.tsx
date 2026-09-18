"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useObserverAlerts } from "@/hooks/alerts/use-alerts";
import { useAlertSound } from "@/hooks/alerts/use-alert-sound";
import { useNotificationCenter } from "@/hooks/alerts/use-notification-center";
import { showAlertOsNotification } from "@/lib/alert-sound";
import { notificationCenter } from "@/lib/notification-center";
import { formatKenyaRelative } from "@/lib/datetime";

function formatPairLabel(pair: string): string {
  const cleanPair = pair.replace("/", "").toUpperCase();
  if (cleanPair.length === 6) {
    return `${cleanPair.slice(0, 3)}/${cleanPair.slice(3)}`;
  }
  return cleanPair;
}

function alertHighlightHref(alertId: string): string {
  return `/alerts/list?status=triggered&highlight=${encodeURIComponent(alertId)}`;
}

function subscribe(callback: () => void): () => void {
  return notificationCenter.subscribe(callback);
}

function getToastSnapshot(): number {
  return notificationCenter.peekToasts().length;
}

function getServerSnapshot(): number {
  return 0;
}

/**
 * Live triggered alerts: FIFO sound playback and LIFO sonner toasts (newest first).
 * When the tab is hidden, shows an OS desktop notification instead of an in-app toast.
 */
export function TriggeredNotificationListener() {
  const router = useRouter();
  const { alerts, hasFetched } = useObserverAlerts();
  const { popNextToast } = useNotificationCenter(alerts.triggered, hasFetched);
  const toastCount = useSyncExternalStore(subscribe, getToastSnapshot, getServerSnapshot);
  const shownToastKeysRef = useRef<Set<string>>(new Set());

  useAlertSound(hasFetched);

  useEffect(() => {
    if (!hasFetched || toastCount === 0) {
      return;
    }

    let item = popNextToast();
    while (item) {
      if (!shownToastKeysRef.current.has(item.triggerKey)) {
        shownToastKeysRef.current.add(item.triggerKey);
        const href = alertHighlightHref(item.alertId);
        const pairLabel = formatPairLabel(item.pair);
        const description = `${item.channel} · ${formatKenyaRelative(item.triggeredAt)}`;
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
          const go = () => {
            router.push(href);
          };
          toast.custom(
            (toastId) => (
              <button
                type="button"
                className="flex w-full min-w-70 cursor-pointer flex-col gap-1 rounded-lg border border-border bg-background p-4 text-left shadow-lg"
                onClick={() => {
                  toast.dismiss(toastId);
                  go();
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
  }, [hasFetched, popNextToast, router, toastCount]);

  return null;
}
