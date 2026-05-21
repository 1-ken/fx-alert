"use client";

import { useEffect, useRef } from "react";
import type { Alert } from "@/types/alerts";
import { isSoundAlertsEnabled, playAlertSound, stopAlertSound } from "@/lib/alert-sound";

export function useAlertSound(triggeredAlerts: Alert[]) {
  const seenTriggeredIdsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);

  useEffect(() => {
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

    const newSoundTriggers = triggeredAlerts.filter(
      (alert) =>
        alert.channel === "sound" &&
        !seenTriggeredIdsRef.current.has(alert.id)
    );

    if (newSoundTriggers.length > 0) {
      void playAlertSound();
    }

    seenTriggeredIdsRef.current = currentIds;
  }, [triggeredAlerts]);

  useEffect(() => {
    return () => {
      stopAlertSound();
    };
  }, []);
}
