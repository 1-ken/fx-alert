"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  isSoundAlertsEnabled,
  playAlertSound,
  stopAlertSound,
} from "@/lib/alert-sound";
import { notificationCenter } from "@/lib/notification-center";

function subscribe(callback: () => void): () => void {
  return notificationCenter.subscribe(callback);
}

function getSnapshot(): number {
  return notificationCenter.hasPendingSound()
    ? notificationCenter.peekToasts().length + 1
    : notificationCenter.peekToasts().length;
}

function getServerSnapshot(): number {
  return 0;
}

/**
 * Drains the notification center FIFO sound queue and plays one alert sound per item
 * while the tab is visible. When the tab is hidden, OS notifications (system sound)
 * are handled by TriggeredNotificationListener instead.
 */
export function useAlertSound(hasFetched: boolean) {
  const storeVersion = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    if (!hasFetched || !isSoundAlertsEnabled()) {
      return;
    }

    let cancelled = false;

    async function drainSoundQueue(): Promise<void> {
      while (!cancelled) {
        const next = notificationCenter.dequeueSound();
        if (!next) {
          break;
        }

        // Background tab: OS banner + system sound come from the toast listener.
        if (typeof document !== "undefined" && document.visibilityState === "hidden") {
          continue;
        }

        try {
          await playAlertSound();
        } catch {
          // ignore playback errors
        }
      }
    }

    void drainSoundQueue();

    return () => {
      cancelled = true;
    };
  }, [hasFetched, storeVersion]);

  useEffect(() => {
    return () => {
      stopAlertSound();
    };
  }, []);
}
