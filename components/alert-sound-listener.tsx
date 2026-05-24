"use client";

import { useObserverAlerts } from "@/hooks/alerts/use-alerts";
import { useAlertSound } from "@/hooks/alerts/use-alert-sound";

/**
 * Plays alert sounds when new triggered alerts arrive (from SWR cache / WebSocket sync).
 */
export function AlertSoundListener() {
  const { alerts, isInitialLoading } = useObserverAlerts();

  useAlertSound(alerts.triggered, isInitialLoading);

  return null;
}
