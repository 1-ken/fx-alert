"use client";

import Link from "next/link";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { buildInstrumentPairUrl } from "@/lib/instrument-navigation";
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
            <div className="flex flex-wrap gap-3 pt-2">
              <Link href={`/alerts/${event.alert_id}`} className="text-sm font-medium text-primary underline-offset-4 hover:underline">
                Open alert
              </Link>
              <Link
                href={buildInstrumentPairUrl(event.pair, event.price)}
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
