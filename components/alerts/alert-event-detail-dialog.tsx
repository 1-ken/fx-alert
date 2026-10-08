"use client";

import Link from "next/link";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { buildTriggeredChartUrl, triggeredChartTargetFromEvent } from "@/lib/instrument-navigation";
import { formatKenyaRelative } from "@/lib/datetime";
import type { AlertEvent } from "@/types/alerts";

export function formatAlertTypeLabel(alertType: string): string {
  switch (alertType) {
    case "candle_close":
      return "Candle close";
    case "prev_day_level":
      return "Prev day H/L";
    case "market_structure":
      return "BOS / CHoCH";
    case "structure_session":
      return "Session";
    case "sweep_confirm":
      return "Sweep confirm";
    case "hour_sweep_cisd":
      return "1h sweep + CISD";
    case "price":
      return "Price";
    default:
      return alertType.replaceAll("_", " ");
  }
}

export function formatEventPair(pair: string): string {
  const cleanPair = pair.replace("/", "").toUpperCase();
  if (cleanPair.length === 6) return `${cleanPair.slice(0, 3)}/${cleanPair.slice(3)}`;
  return pair;
}

const DELIVERY_LABELS: Record<string, string> = {
  call: "Call",
  sms: "SMS",
  email: "Email",
};

export function formatDeliverySummary(event: AlertEvent): string {
  const parts: string[] = [];
  for (const key of ["call", "sms", "email"]) {
    const item = event.delivery?.[key];
    if (!item?.status) continue;
    const label = DELIVERY_LABELS[key] ?? key;
    if (item.status === "skipped") {
      parts.push(item.reason ? `${label} skipped: ${item.reason}` : `${label} skipped`);
    } else if (item.status === "failed") {
      parts.push(item.reason ? `${label} failed: ${item.reason}` : `${label} failed`);
    } else if (item.status === "queued") {
      parts.push(`${label} queued for the next call`);
    } else if (item.status === "placed") {
      parts.push(`${label} placed`);
    } else if (item.status === "sent") {
      parts.push(`${label} sent`);
    }
  }
  return parts.join(" · ");
}

function detailLine(label: string, value: string | null | undefined) {
  if (!value) return null;
  return (
    <p>
      <span className="text-muted-foreground">{label}: </span>
      <span className="text-foreground">{value}</span>
    </p>
  );
}

export function AlertEventDetailDialog({
  event,
  open,
  onOpenChange,
}: {
  event: AlertEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const alert = event?.data;
  const condition =
    alert?.alert_type === "price"
      ? [alert.condition, alert.target_price]
          .filter((part) => part != null)
          .map(String)
          .join(" ")
      : alert?.alert_type === "candle_close"
        ? [alert.interval, alert.direction, alert.threshold]
          .filter((part) => part != null && part !== "")
          .map(String)
          .join(" ")
        : alert?.alert_type === "structure_session"
          ? (alert.intervals ?? []).join(" → ")
          : alert?.alert_type === "sweep_confirm"
            ? "1h swing, 5m confirm"
            : alert?.alert_type === "hour_sweep_cisd"
              ? "Prev 1h high/low swept, 5m CISD"
              : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {event ? formatEventPair(event.pair) : "Alert"}{" "}
            {event ? formatAlertTypeLabel(event.alert_type) : ""}
          </DialogTitle>
        </DialogHeader>
        {event ? (
          <div className="space-y-2 text-sm">
            {detailLine("Fired", formatKenyaRelative(event.triggered_at))}
            {detailLine("Price", Number.isFinite(event.price) ? String(event.price) : null)}
            {detailLine("Timeframe", event.timeframe)}
            {detailLine("Condition", condition)}
            {detailLine("Events", alert?.structure_event?.join(", "))}
            {detailLine("Direction", alert?.structure_direction)}
            {detailLine("Message", alert?.custom_message)}
            {detailLine("Delivery", formatDeliverySummary(event))}
            <div className="flex flex-wrap gap-3 pt-2">
              <Link href={`/alerts/${event.alert_id}`} className="text-sm font-medium text-primary underline-offset-4 hover:underline">
                Open alert
              </Link>
              <Link
                href={buildTriggeredChartUrl(triggeredChartTargetFromEvent(event))}
                className="text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                Open chart
              </Link>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
