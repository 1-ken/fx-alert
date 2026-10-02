"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { Alert } from "@/types/alerts";
import {
  installVisitTracking,
  notificationCenter,
  type TriggerNotification,
} from "@/lib/notification-center";

function subscribe(callback: () => void): () => void {
  return notificationCenter.subscribe(callback);
}

function getSnapshot(): number {
  return (
    notificationCenter.getActivityFeed().length +
    notificationCenter.peekToasts().length +
    (notificationCenter.hasPendingSound() ? 1 : 0)
  );
}

function getServerSnapshot(): number {
  return 0;
}

/**
 * Hydrates the live toast and sound queues from triggered alerts.
 */
export function useNotificationCenter(triggeredAlerts: Alert[], hasFetched: boolean) {
  useEffect(() => {
    return installVisitTracking();
  }, []);

  useEffect(() => {
    if (!hasFetched) {
      return;
    }

    if (!notificationCenter.isHydrated) {
      notificationCenter.hydrateFromAlerts(triggeredAlerts);
      return;
    }

    notificationCenter.ingest(triggeredAlerts);
  }, [hasFetched, triggeredAlerts]);

  const storeVersion = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  void storeVersion;

  const popNextToast = useCallback(() => notificationCenter.popNextToast(), []);
  const dequeueSound = useCallback(() => notificationCenter.dequeueSound(), []);
  const peekToasts = useCallback(() => notificationCenter.peekToasts(), []);

  return {
    activityFeed: notificationCenter.getActivityFeed(),
    popNextToast,
    dequeueSound,
    peekToasts,
    isHydrated: notificationCenter.isHydrated,
  };
}

export type { TriggerNotification };
