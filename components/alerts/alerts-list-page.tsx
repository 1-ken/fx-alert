"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeftIcon, BellAlertIcon, PencilIcon, TrashIcon } from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useObserverAlerts } from "@/hooks/alerts/use-alerts";
import { formatKenyaDateTime } from "@/lib/datetime";

type AlertStatusFilter =
  | "all"
  | "active"
  | "triggered"
  | "triggered-today"
  | "triggered-5m";

type AlertTypeFilter = "all" | "price" | "candle_close";

interface AlertsListPageProps {
  initialStatus?: string;
  initialType?: string;
}

function normalizeStatus(value?: string): AlertStatusFilter {
  if (
    value === "active" ||
    value === "triggered" ||
    value === "triggered-today" ||
    value === "triggered-5m"
  ) {
    return value;
  }

  return "all";
}

function normalizeType(value?: string): AlertTypeFilter {
  if (value === "price" || value === "candle_close") {
    return value;
  }

  return "all";
}

function isTriggeredToday(triggeredAt: string | null): boolean {
  if (!triggeredAt) {
    return false;
  }

  const date = new Date(triggeredAt);
  const now = new Date();

  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function isTriggeredInLastFiveMinutes(triggeredAt: string | null): boolean {
  if (!triggeredAt) {
    return false;
  }

  const triggeredAtMs = new Date(triggeredAt).getTime();
  if (!Number.isFinite(triggeredAtMs)) {
    return false;
  }

  const nowMs = Date.now();
  const fiveMinutesMs = 5 * 60 * 1000;

  return triggeredAtMs <= nowMs && nowMs - triggeredAtMs <= fiveMinutesMs;
}

function formatPairLabel(pair: string): string {
  const cleanPair = pair.replace("/", "").toUpperCase();
  if (cleanPair.length === 6) {
    return `${cleanPair.slice(0, 3)}/${cleanPair.slice(3)}`;
  }

  return pair;
}

function formatCondition(condition: string): string {
  if (condition === "above") {
    return "Above";
  }

  if (condition === "below") {
    return "Below";
  }

  return "Equals";
}

function formatDirection(direction: string | null): string {
  if (direction === "above") {
    return "Above";
  }

  if (direction === "below") {
    return "Below";
  }

  return "-";
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return "-";
  }

  return formatKenyaDateTime(value);
}

function formatTriggerDuration(createdAt: string, triggeredAt: string | null): string {
  if (!triggeredAt) {
    return "Not triggered yet";
  }

  const createdMs = new Date(createdAt).getTime();
  const triggeredMs = new Date(triggeredAt).getTime();

  if (!Number.isFinite(createdMs) || !Number.isFinite(triggeredMs) || triggeredMs < createdMs) {
    return "-";
  }

  const durationMs = triggeredMs - createdMs;
  const totalSeconds = Math.floor(durationMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);

  return parts.join(" ");
}

export function AlertsListPage({ initialStatus, initialType }: AlertsListPageProps) {
  const status = normalizeStatus(initialStatus);
  const type = normalizeType(initialType);
  const { alerts, isInitialLoading, deleteAlert } = useObserverAlerts();
  const [deleteTarget, setDeleteTarget] = useState<(typeof alerts.all)[number] | null>(null);
  const [selectedAlertIds, setSelectedAlertIds] = useState<Set<string>>(new Set());
  const [isBulkDeleteDialogOpen, setIsBulkDeleteDialogOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const isTriggeredView =
    status === "triggered" ||
    status === "triggered-today" ||
    status === "triggered-5m";

  const triggeredSorted = useMemo(() => {
    if (!alerts) {
      return [];
    }

    return [...alerts.triggered].sort((a, b) => {
      const aTime = a.triggered_at ? new Date(a.triggered_at).getTime() : 0;
      const bTime = b.triggered_at ? new Date(b.triggered_at).getTime() : 0;
      return bTime - aTime;
    });
  }, [alerts]);

  const triggeredToday = useMemo(
    () => triggeredSorted.filter((alert) => isTriggeredToday(alert.triggered_at)),
    [triggeredSorted]
  );

  const triggeredLastFiveMinutes = useMemo(
    () =>
      triggeredSorted.filter((alert) =>
        isTriggeredInLastFiveMinutes(alert.triggered_at)
      ),
    [triggeredSorted]
  );

  const listedAlerts = useMemo(() => {
    if (!alerts) {
      return [];
    }

    if (status === "active") {
      return alerts.active;
    }

    if (status === "triggered") {
      return triggeredSorted;
    }

    if (status === "triggered-today") {
      return triggeredToday;
    }

    if (status === "triggered-5m") {
      return triggeredLastFiveMinutes;
    }

    return alerts.all;
  }, [alerts, status, triggeredLastFiveMinutes, triggeredSorted, triggeredToday]);

  const typeFilteredAlerts = useMemo(() => {
    if (type === "all") {
      return listedAlerts;
    }

    return listedAlerts.filter((alert) => alert.alert_type === type);
  }, [listedAlerts, type]);

  const typeCounts = useMemo(() => {
    const source = alerts?.all ?? [];

    return {
      all: source.length,
      price: source.filter((alert) => alert.alert_type === "price").length,
      candle_close: source.filter((alert) => alert.alert_type === "candle_close").length,
    };
  }, [alerts?.all]);

  const hrefFor = (nextStatus: AlertStatusFilter, nextType: AlertTypeFilter) => {
    const params = new URLSearchParams();
    params.set("status", nextStatus);

    if (nextType !== "all") {
      params.set("type", nextType);
    }

    return `/alerts/list?${params.toString()}`;
  };

  const visibleAlertIdSet = useMemo(
    () => new Set(typeFilteredAlerts.map((alert) => alert.id)),
    [typeFilteredAlerts]
  );

  const selectedVisibleIds = useMemo(
    () => [...selectedAlertIds].filter((id) => visibleAlertIdSet.has(id)),
    [selectedAlertIds, visibleAlertIdSet]
  );

  const selectedVisibleCount = selectedVisibleIds.length;
  const hasVisibleAlerts = typeFilteredAlerts.length > 0;
  const allVisibleSelected = hasVisibleAlerts && selectedVisibleCount === typeFilteredAlerts.length;

  useEffect(() => {
    setSelectedAlertIds((current) => {
      const next = new Set<string>();

      current.forEach((id) => {
        if (visibleAlertIdSet.has(id)) {
          next.add(id);
        }
      });

      return next.size === current.size ? current : next;
    });
  }, [visibleAlertIdSet]);

  const toggleAlertSelection = (alertId: string, checked: boolean) => {
    setSelectedAlertIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(alertId);
      } else {
        next.delete(alertId);
      }

      return next;
    });
  };

  const toggleSelectAllVisible = (checked: boolean) => {
    setSelectedAlertIds((current) => {
      const next = new Set(current);

      if (checked) {
        typeFilteredAlerts.forEach((alert) => next.add(alert.id));
      } else {
        typeFilteredAlerts.forEach((alert) => next.delete(alert.id));
      }

      return next;
    });
  };

  const handleBulkDelete = async () => {
    if (selectedVisibleIds.length === 0) {
      setIsBulkDeleteDialogOpen(false);
      return;
    }

    setIsBulkDeleting(true);

    try {
      for (const alertId of selectedVisibleIds) {
        await deleteAlert(alertId);
      }

      setSelectedAlertIds(new Set());
      setIsBulkDeleteDialogOpen(false);
    } finally {
      setIsBulkDeleting(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-4 px-4 py-8">
      <header className="rounded-xl border bg-card/80 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="icon" className="h-10 w-10">
              <Link href="/dashboard" aria-label="Back to dashboard">
                <ArrowLeftIcon className="h-5 w-5" />
              </Link>
            </Button>
            <div className="rounded-xl bg-primary/15 p-2.5 text-primary">
              <BellAlertIcon className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Alerts</h1>
              <p className="text-sm text-muted-foreground">View and track your created alerts</p>
            </div>
          </div>

          <div className="flex flex-col items-start gap-2 sm:items-end">
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild variant={type === "all" ? "default" : "outline"} size="sm">
                <Link href={hrefFor(status, "all")}>All types ({typeCounts.all})</Link>
              </Button>
              <Button asChild variant={type === "price" ? "default" : "outline"} size="sm">
                <Link href={hrefFor(status, "price")}>Price ({typeCounts.price})</Link>
              </Button>
              <Button asChild variant={type === "candle_close" ? "default" : "outline"} size="sm">
                <Link href={hrefFor(status, "candle_close")}>Candle close ({typeCounts.candle_close})</Link>
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant={status === "all" ? "default" : "outline"} size="sm">
              <Link href={hrefFor("all", type)}>All ({alerts?.all.length ?? 0})</Link>
            </Button>
            <Button asChild variant={status === "active" ? "default" : "outline"} size="sm">
              <Link href={hrefFor("active", type)}>Active ({alerts?.active.length ?? 0})</Link>
            </Button>
            </div>
            {isTriggeredView ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button asChild variant={isTriggeredView ? "default" : "outline"} size="sm">
                  <Link href={hrefFor("triggered", type)}>Triggered ({triggeredSorted.length})</Link>
                </Button>
                <Button asChild variant={status === "triggered-today" ? "default" : "outline"} size="sm">
                  <Link href={hrefFor("triggered-today", type)}>Triggered today ({triggeredToday.length})</Link>
                </Button>
                <Button asChild variant={status === "triggered-5m" ? "default" : "outline"} size="sm">
                  <Link href={hrefFor("triggered-5m", type)}>Triggered 5m ({triggeredLastFiveMinutes.length})</Link>
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {hasVisibleAlerts ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card/60 p-3">
          <div className="flex items-center gap-3">
            <Checkbox
              checked={allVisibleSelected}
              onCheckedChange={(checked) => toggleSelectAllVisible(Boolean(checked))}
              aria-label="Select all alerts in current view"
            />
            <span className="text-sm text-muted-foreground">
              {selectedVisibleCount > 0
                ? `${selectedVisibleCount} selected`
                : `Select alerts (${typeFilteredAlerts.length} in view)`}
            </span>
          </div>

          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={selectedVisibleCount === 0 || isBulkDeleting}
            onClick={() => setIsBulkDeleteDialogOpen(true)}
          >
            Delete selected
          </Button>
        </div>
      ) : null}

      {isInitialLoading && alerts.all.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Loading alerts...
          </CardContent>
        </Card>
      ) : typeFilteredAlerts.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No alerts found for this view.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {typeFilteredAlerts.map((alert) => (
            <Card key={alert.id}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={selectedAlertIds.has(alert.id)}
                      onCheckedChange={(checked) => toggleAlertSelection(alert.id, Boolean(checked))}
                      aria-label={`Select alert for ${alert.pair}`}
                    />
                    <CardTitle className="text-lg">{formatPairLabel(alert.pair)}</CardTitle>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{alert.alert_type === "candle_close" ? "candle close" : "price"}</Badge>
                    <Badge variant={alert.status === "active" ? "default" : "secondary"}>
                      {alert.status}
                    </Badge>
                    {alert.status !== "triggered" ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground"
                        asChild
                      >
                        <Link href={`/alerts/${alert.id}`} aria-label={`Edit alert for ${alert.pair}`}>
                          <PencilIcon className="h-4 w-4" />
                        </Link>
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => setDeleteTarget(alert)}
                      aria-label={`Delete alert for ${alert.pair}`}
                    >
                      <TrashIcon className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-1 text-sm text-muted-foreground">
                {alert.alert_type === "price" ? (
                  <p>
                    Condition:{" "}
                    <span className="text-foreground">
                      {formatCondition(alert.condition ?? "equal")} {alert.target_price ?? "-"}
                    </span>
                  </p>
                ) : (
                  <>
                    <p>
                      Interval: <span className="text-foreground">{alert.interval ?? "-"}</span>
                    </p>
                    <p>
                      Direction: <span className="text-foreground">{formatDirection(alert.direction)}</span>
                    </p>
                    <p>
                      Threshold: <span className="text-foreground">{alert.threshold ?? "-"}</span>
                    </p>
                    <p>
                      Last evaluated candle: <span className="text-foreground">{formatDateTime(alert.last_evaluated_candle_time)}</span>
                    </p>
                  </>
                )}
                {alert.last_checked_price !== null ? (
                  <p>
                    Last checked price: <span className="text-foreground">{alert.last_checked_price}</span>
                  </p>
                ) : null}
                <p>
                  Channel:{" "}
                  <span className="text-foreground uppercase">
                    {(alert.channels && alert.channels.length > 0
                      ? alert.channels
                      : [alert.channel]
                    ).join(", ")}
                  </span>
                </p>
                {alert.email ? (
                  <p>
                    Email: <span className="text-foreground">{alert.email}</span>
                  </p>
                ) : null}
                {alert.phone ? (
                  <p>
                    Phone: <span className="text-foreground">{alert.phone}</span>
                  </p>
                ) : null}
                {alert.custom_message ? (
                  <p>
                    Message: <span className="text-foreground">{alert.custom_message}</span>
                  </p>
                ) : null}
                <p>
                  Created: <span className="text-foreground">{formatDateTime(alert.created_at)}</span>
                </p>
                <p>
                  Triggered: <span className="text-foreground">{formatDateTime(alert.triggered_at)}</span>
                </p>
                <p>
                  Time to trigger: <span className="text-foreground">{formatTriggerDuration(alert.created_at, alert.triggered_at)}</span>
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete alert?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the alert for {deleteTarget ? formatPairLabel(deleteTarget.pair) : "this pair"}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteTarget(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!deleteTarget) {
                  return;
                }

                const alertId = deleteTarget.id;
                setDeleteTarget(null);
                await deleteAlert(alertId);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isBulkDeleteDialogOpen} onOpenChange={setIsBulkDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete selected alerts?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {selectedVisibleCount} selected alert{selectedVisibleCount === 1 ? "" : "s"}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={selectedVisibleCount === 0 || isBulkDeleting}
              onClick={handleBulkDelete}
            >
              {isBulkDeleting ? "Deleting..." : "Delete selected"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
