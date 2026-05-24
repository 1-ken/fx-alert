"use client";

import { useEffect, useRef } from "react";
import type { Alert } from "@/types/alerts";
import {
  HEARD_SOUND_TRIGGERS_KEY,
  isSoundAlertsEnabled,
  playAlertSound,
  SOUND_TRIGGER_RECENCY_MS,
  stopAlertSound,
} from "@/lib/alert-sound";

function loadHeardKeys(): Set<string> {
  if (typeof window === "undefined") {
    return new Set();
  }

  try {
    const raw = window.sessionStorage.getItem(HEARD_SOUND_TRIGGERS_KEY);
    if (!raw) {
      return new Set();
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return new Set();
    }
    return new Set(parsed.filter((item): item is string => typeof item === "string"));
  } catch {
    return new Set();
  }
}

function persistHeardKeys(keys: Set<string>): void {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(HEARD_SOUND_TRIGGERS_KEY, JSON.stringify([...keys]));
}

function triggerKey(alert: Alert): string {
  return `${alert.id}:${alert.triggered_at ?? ""}`;
}

function isRecentSoundTrigger(alert: Alert, nowMs: number): boolean {
  if (alert.channel !== "sound" || !alert.triggered_at) {
    return false;
  }

  const triggeredMs = Date.parse(alert.triggered_at);
  if (!Number.isFinite(triggeredMs)) {
    return false;
  }

  return nowMs - triggeredMs <= SOUND_TRIGGER_RECENCY_MS;
}

export function useAlertSound(triggeredAlerts: Alert[], isInitialLoading: boolean) {
  const seenTriggeredIdsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);
  const heardKeysRef = useRef<Set<string>>(loadHeardKeys());

  useEffect(() => {
    if (isInitialLoading) {
      return;
    }

    const currentIds = new Set(triggeredAlerts.map((alert) => alert.id));

    if (!initializedRef.current) {
      seenTriggeredIdsRef.current = currentIds;
      initializedRef.current = true;
      return;
    }

    if (!isSoundAlertsEnabled()) {
      seenTriggeredIdsRef.current = currentIds;
      return;
    }

    const nowMs = Date.now();
    const newSoundTriggers = triggeredAlerts.filter((alert) => {
      if (!isRecentSoundTrigger(alert, nowMs)) {
        return false;
      }

      const key = triggerKey(alert);
      if (heardKeysRef.current.has(key)) {
        return false;
      }

      return !seenTriggeredIdsRef.current.has(alert.id);
    });

    if (newSoundTriggers.length > 0) {
      for (const alert of newSoundTriggers) {
        heardKeysRef.current.add(triggerKey(alert));
      }
      persistHeardKeys(heardKeysRef.current);
      void playAlertSound();
    }

    seenTriggeredIdsRef.current = currentIds;
  }, [isInitialLoading, triggeredAlerts]);

  useEffect(() => {
    return () => {
      stopAlertSound();
    };
  }, []);
}
