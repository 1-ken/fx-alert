"use client";

import { useMemo } from "react";
import { useStreamAlerts } from "@/components/stream-alerts-provider";
import { useObserverAlerts } from "@/hooks/alerts/use-alerts";
import { useAlertSound } from "@/hooks/alerts/use-alert-sound";

export function AlertSoundListener() {
  const streamAlerts = useStreamAlerts();
  const { alerts: swrAlerts } = useObserverAlerts();

  const triggeredAlerts = useMemo(() => {
    const byId = new Map<string, (typeof streamAlerts.triggered)[number]>();

    for (const alert of swrAlerts.triggered) {
      byId.set(alert.id, alert);
    }

    for (const alert of streamAlerts.triggered) {
      byId.set(alert.id, alert);
    }

    return Array.from(byId.values());
  }, [streamAlerts.triggered, swrAlerts.triggered]);

  useAlertSound(triggeredAlerts);

  return null;
}
