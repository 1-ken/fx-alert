"use client";

import { useState } from "react";
import { BellIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatKenyaRelative } from "@/lib/datetime";
import { useAlertEvents } from "@/hooks/alerts/use-alert-events";
import type { AlertEvent } from "@/types/alerts";
import {
  AlertEventDetailDialog,
  formatAlertTypeLabel,
  formatEventPair,
} from "@/components/alerts/alert-event-detail-dialog";
import { cn } from "@/lib/utils";

function EventRows({
  events,
  onSelect,
}: {
  events: AlertEvent[];
  onSelect: (event: AlertEvent) => void;
}) {
  if (events.length === 0) {
    return <p className="px-3 py-6 text-center text-sm text-muted-foreground">No alerts yet</p>;
  }
  return (
    <ul className="max-h-96 space-y-1 overflow-y-auto">
      {events.map((event) => (
        <li key={event.id}>
          <button
            type="button"
            onClick={() => onSelect(event)}
            className="flex w-full items-start gap-2 rounded-md px-3 py-2 text-left hover:bg-accent"
          >
            <span
              className={cn(
                "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                event.read_at ? "bg-transparent" : "bg-primary",
              )}
            />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">
                {formatEventPair(event.pair)} · {formatAlertTypeLabel(event.alert_type)}
              </span>
              <span className="block text-xs text-muted-foreground">
                {[
                  event.timeframe,
                  Number.isFinite(event.price) ? String(event.price) : null,
                  formatKenyaRelative(event.triggered_at),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function EventPanel({
  events,
  unreadCount,
  onSelect,
  onMarkAll,
}: {
  events: AlertEvent[];
  unreadCount: number;
  onSelect: (event: AlertEvent) => void;
  onMarkAll: () => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <p className="text-sm font-medium">Alerts {unreadCount > 0 ? `(${unreadCount} unread)` : ""}</p>
        {unreadCount > 0 ? (
          <Button type="button" variant="ghost" size="sm" onClick={onMarkAll}>
            Mark all as read
          </Button>
        ) : null}
      </div>
      <EventRows events={events} onSelect={onSelect} />
    </div>
  );
}

export function NotificationBell() {
  const { events, unreadCount, markRead, markAllRead } = useAlertEvents();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopOpen, setDesktopOpen] = useState(false);
  const [selected, setSelected] = useState<AlertEvent | null>(null);

  const select = (event: AlertEvent) => {
    setSelected(event);
    setMobileOpen(false);
    setDesktopOpen(false);
    if (!event.read_at) void markRead(event.id);
  };

  const badge =
    unreadCount > 0 ? (
      <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
        {unreadCount > 99 ? "99+" : unreadCount}
      </span>
    ) : null;

  const trigger = (
    <Button type="button" variant="ghost" size="icon" className="relative" aria-label="Alerts">
      <BellIcon className="h-5 w-5" />
      {badge}
    </Button>
  );

  return (
    <>
      <div className="md:hidden">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="relative"
          aria-label="Alerts"
          onClick={() => setMobileOpen(true)}
        >
          <BellIcon className="h-5 w-5" />
          {badge}
        </Button>
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="bottom" className="max-h-[80vh]">
            <SheetHeader>
              <SheetTitle>Alerts</SheetTitle>
            </SheetHeader>
            <EventPanel
              events={events}
              unreadCount={unreadCount}
              onSelect={select}
              onMarkAll={() => void markAllRead()}
            />
          </SheetContent>
        </Sheet>
      </div>
      <div className="hidden md:block">
        <Popover open={desktopOpen} onOpenChange={setDesktopOpen}>
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-3">
            <EventPanel
              events={events}
              unreadCount={unreadCount}
              onSelect={select}
              onMarkAll={() => void markAllRead()}
            />
          </PopoverContent>
        </Popover>
      </div>
      <AlertEventDetailDialog
        event={selected}
        open={selected != null}
        onOpenChange={(next) => {
          if (!next) setSelected(null);
        }}
      />
    </>
  );
}
