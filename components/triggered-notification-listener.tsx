"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { useObserverAlerts } from "@/hooks/alerts/use-alerts";
import { useAlertSound } from "@/hooks/alerts/use-alert-sound";
import { useNotificationCenter } from "@/hooks/alerts/use-notification-center";
import { notificationCenter } from "@/lib/notification-center";
import { formatKenyaRelative } from "@/lib/datetime";

function formatPairLabel(pair: string): string {
  const cleanPair = pair.replace("/", "").toUpperCase();
  if (cleanPair.length === 6) {
    return `${cleanPair.slice(0, 3)}/${cleanPair.slice(3)}`;
  }
  return cleanPair;
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
 */
export function TriggeredNotificationListener() {
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
        toast(`Alert triggered: ${formatPairLabel(item.pair)}`, {
          description: `${item.channel} · ${formatKenyaRelative(item.triggeredAt)}`,
          duration: 8_000,
        });
      }
      item = popNextToast();
    }
  }, [hasFetched, popNextToast, toastCount]);

  return null;
}
