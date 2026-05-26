"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
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
    (notificationCenter.hasPendingSound() ? 1 : 0) +
    (notificationCenter.getLastVisitAt()?.length ?? 0)
  );
}

function getServerSnapshot(): number {
  return 0;
}

/**
 * Orchestrates notification center hydration/ingest and exposes unseen-since-visit state.
 */
export function useNotificationCenter(
  triggeredAlerts: Alert[],
  hasFetched: boolean,
) {
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

  const unseenSinceVisit = useMemo(
    () => notificationCenter.getUnseenSinceVisit(triggeredAlerts),
    [triggeredAlerts, storeVersion],
  );

  const activityFeed = useMemo(
    () => notificationCenter.getActivityFeed(),
    [storeVersion],
  );

  const markVisitNow = useCallback(() => {
    notificationCenter.markVisitNow();
  }, []);

  const popNextToast = useCallback(() => notificationCenter.popNextToast(), []);
  const dequeueSound = useCallback(() => notificationCenter.dequeueSound(), []);
  const peekToasts = useCallback(() => notificationCenter.peekToasts(), []);

  return {
    unseenSinceVisit,
    activityFeed,
    markVisitNow,
    popNextToast,
    dequeueSound,
    peekToasts,
    isHydrated: notificationCenter.isHydrated,
  };
}

export type { TriggerNotification };
