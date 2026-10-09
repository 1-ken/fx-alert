"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { EyeIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useBootstrap } from "@/components/bootstrap-provider";
import { useObserverAlerts } from "@/hooks/alerts/use-alerts";
import {
  defaultNotifyLabel,
  getDefaultNotifyChannel,
  type DefaultNotifyChannel,
} from "@/lib/alert-preferences";
import {
  DEFAULT_WATCH_MESSAGE,
  WATCH_MESSAGE_STORAGE_KEY,
  watchMessageMaxChars,
  watchNeedsMessage,
  WATCH_TYPES,
  WATCH_TYPE_LABELS,
  buildWatchPayload,
  checkWatchRequest,
  collectWatchAlertIds,
  errorMessage,
  pairKey,
  pairLabel,
  planWatchSteps,
  summarizeWatched,
  type WatchStep,
  type WatchType,
} from "@/lib/favorite-watch";
import { cn } from "@/lib/utils";

type Mode = "closed" | "view" | "watch";

interface StepResult {
  step: WatchStep;
  ok: boolean;
  message?: string;
}

function typeSummaryLabel(results: StepResult[]): string {
  const ok = results.filter((r) => r.ok).length;
  return `Created ${ok} of ${results.length}`;
}

/**
 * Favorites header button: "Watch" opens the setup dialog. Once any favorite has
 * one of the four multi-pair alerts, it becomes "View" and lists what is watched.
 */
export function FavoritesWatch({ favorites }: { favorites: string[] }) {
  const { data: session } = useSession();
  const { bootstrap } = useBootstrap();
  const { alerts, hasFetched, createAlert, deleteAlert, mutate } = useObserverAlerts();
  const [mode, setMode] = useState<Mode>("closed");
  const [channel, setChannel] = useState<DefaultNotifyChannel>("sound");
  const [selectedPairs, setSelectedPairs] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<WatchType[]>([...WATCH_TYPES]);
  const [message, setMessage] = useState(DEFAULT_WATCH_MESSAGE);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<StepResult[] | null>(null);
  const runningRef = useRef(false);
  const stoppingRef = useRef(false);
  const [stopping, setStopping] = useState(false);
  const [stopSelected, setStopSelected] = useState<string[]>([]);
  const [confirmStop, setConfirmStop] = useState(false);

  const all = useMemo(() => alerts?.all ?? [], [alerts?.all]);
  const summary = useMemo(() => summarizeWatched(all, favorites), [all, favorites]);
  const watchedKeys = useMemo(() => summary.pairs.map((row) => row.key), [summary.pairs]);
  // Only keys that still exist can be selected (rows vanish as deletes finish).
  const validStopSelected = useMemo(
    () => stopSelected.filter((key) => watchedKeys.includes(key)),
    [stopSelected, watchedKeys],
  );
  const stopIds = useMemo(
    () => collectWatchAlertIds(summary, validStopSelected),
    [summary, validStopSelected],
  );
  const activeCount = (alerts?.active?.length ?? 0) + (alerts?.waiting?.length ?? 0);
  const phone = bootstrap?.phone?.trim() ?? "";
  const email = session?.user?.email?.trim() ?? "";

  const openWatch = () => {
    setChannel(getDefaultNotifyChannel() ?? "sound");
    setMessage(window.localStorage.getItem(WATCH_MESSAGE_STORAGE_KEY) || DEFAULT_WATCH_MESSAGE);
    setSelectedPairs(favorites.map(pairKey));
    setSelectedTypes([...WATCH_TYPES]);
    setResults(null);
    setMode("watch");
  };

  useEffect(() => {
    if (mode === "closed" && !runningRef.current) setResults(null);
  }, [mode]);

  const watchedPairCount = summary.pairs.length;
  useEffect(() => {
    // Last watched pair removed: leave the (now empty) View dialog.
    if (mode === "view" && hasFetched && watchedPairCount === 0 && !stopping) {
      setConfirmStop(false);
      setMode("closed");
    }
  }, [mode, hasFetched, watchedPairCount, stopping]);

  const check = checkWatchRequest({
    types: selectedTypes,
    pairs: selectedPairs,
    channel,
    phone,
    email,
    message,
    bootstrap,
    activeCount,
  });

  const existingForSelection = useMemo(() => {
    const keys = new Set(selectedPairs);
    let count = 0;
    for (const row of summary.pairs) {
      if (!keys.has(row.key)) continue;
      for (const type of selectedTypes) count += row.byType[type].length;
    }
    return count;
  }, [selectedPairs, selectedTypes, summary.pairs]);

  const run = async (steps: WatchStep[]) => {
    if (runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    const out: StepResult[] = [];
    try {
      for (const step of steps) {
        try {
          await createAlert(
            buildWatchPayload(step.type, step.pairs, {
              channel,
              phone,
              email,
              message,
              now: Date.now(),
            }),
            { silent: true },
          );
          out.push({ step, ok: true });
        } catch (error) {
          out.push({ step, ok: false, message: errorMessage(error) });
        }
        setResults([...out]);
      }
      await mutate();
    } finally {
      runningRef.current = false;
      setRunning(false);
    }
  };

  const openView = () => {
    setStopSelected([]);
    setMode("view");
  };

  const stopWatching = async () => {
    if (stoppingRef.current) return;
    const ids = stopIds;
    if (ids.length === 0) {
      setConfirmStop(false);
      return;
    }
    stoppingRef.current = true;
    setStopping(true);
    const failedIds = new Set<string>();
    let deleted = 0;
    try {
      for (const id of ids) {
        try {
          await deleteAlert(id, { silent: true });
          deleted += 1;
        } catch {
          failedIds.add(id);
        }
      }
      await mutate();
    } finally {
      stoppingRef.current = false;
      setStopping(false);
      setConfirmStop(false);
    }
    if (failedIds.size === 0) {
      toast.success(`Stopped watching: ${deleted} alert${deleted === 1 ? "" : "s"} deleted`);
      setStopSelected([]);
    } else {
      toast.error(`Deleted ${deleted} of ${ids.length} alerts. ${failedIds.size} failed.`);
      // Keep only pairs that still have alerts so they can be retried.
      setStopSelected((prev) => prev.filter((key) => watchedKeys.includes(key)));
    }
  };

  const startWatch = () => {
    if (!check.ok) return;
    if (watchNeedsMessage(channel)) {
      window.localStorage.setItem(WATCH_MESSAGE_STORAGE_KEY, message.trim());
    }
    setResults([]);
    void run(planWatchSteps(selectedTypes, selectedPairs));
  };

  const retryFailed = () => {
    const failed = (results ?? []).filter((r) => !r.ok).map((r) => r.step);
    if (failed.length === 0) return;
    setResults([]);
    void run(failed);
  };

  const toggle = <T,>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

  const noFavorites = favorites.length === 0;
  const watchedCount = summary.pairs.length;
  const label = !hasFetched ? "Watch" : watchedCount > 0 ? `View (${watchedCount})` : "Watch";

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={noFavorites || !hasFetched}
        title={noFavorites ? "Add favorites first" : undefined}
        onClick={() => (watchedCount > 0 ? openView() : openWatch())}
      >
        <EyeIcon className="mr-1 h-4 w-4" />
        {label}
      </Button>

      <Dialog
        open={mode === "view"}
        onOpenChange={(open) => {
          if (!open && !stopping) setMode("closed");
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Watching {watchedCount} pair{watchedCount === 1 ? "" : "s"}
            </DialogTitle>
            <DialogDescription>
              {favorites.length - summary.unwatchedFavorites.length} of {favorites.length}{" "}
              favorites have at least one alert.
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="w-8 py-2 pr-2">
                    <Checkbox
                      aria-label="Select all watched pairs"
                      disabled={stopping || watchedKeys.length === 0}
                      checked={
                        validStopSelected.length > 0 &&
                        validStopSelected.length === watchedKeys.length
                      }
                      onCheckedChange={() =>
                        setStopSelected(
                          validStopSelected.length === watchedKeys.length ? [] : watchedKeys,
                        )
                      }
                    />
                  </th>
                  <th className="py-2 pr-3 font-medium">Pair</th>
                  {WATCH_TYPES.map((type) => (
                    <th key={type} className="px-2 py-2 text-center font-medium">
                      {WATCH_TYPE_LABELS[type]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {summary.pairs.map((row) => (
                  <tr key={row.key} className="border-t border-border">
                    <td className="w-8 py-2 pr-2">
                      <Checkbox
                        aria-label={`Select ${row.pair}`}
                        disabled={stopping}
                        checked={validStopSelected.includes(row.key)}
                        onCheckedChange={() =>
                          setStopSelected(toggle(validStopSelected, row.key))
                        }
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <span className="font-medium">{row.pair}</span>
                      {!row.isFavorite ? (
                        <span className="ml-2 text-xs text-muted-foreground">not in favorites</span>
                      ) : null}
                    </td>
                    {WATCH_TYPES.map((type) => {
                      const ids = row.byType[type];
                      return (
                        <td key={type} className="px-2 py-2 text-center">
                          {ids.length === 0 ? (
                            <span className="text-muted-foreground">-</span>
                          ) : (
                            <Link
                              href={
                                ids.length === 1
                                  ? `/alerts/${ids[0]}`
                                  : `/alerts/list?status=active&type=${type}`
                              }
                              className="text-primary underline-offset-4 hover:underline"
                              onClick={() => setMode("closed")}
                            >
                              ✓{ids.length > 1 ? ` ${ids.length}` : ""}
                            </Link>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {summary.unwatchedFavorites.length > 0 ? (
            <p className="text-sm text-muted-foreground">
              Not watched yet: {summary.unwatchedFavorites.join(", ")}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button onClick={openWatch} disabled={stopping}>
              Add alerts
            </Button>
            <Button
              variant="destructive"
              disabled={stopping || stopIds.length === 0}
              onClick={() => setConfirmStop(true)}
            >
              {stopping ? "Stopping..." : `Stop watching (${validStopSelected.length})`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={confirmStop}
        onOpenChange={(open) => {
          if (!open && !stopping) setConfirmStop(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stop watching?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes {stopIds.length} alert{stopIds.length === 1 ? "" : "s"} across{" "}
              {validStopSelected.length} pair{validStopSelected.length === 1 ? "" : "s"}. Your
              favorites are not changed and triggered alerts are kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={stopping}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={stopping || stopIds.length === 0}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                void stopWatching();
              }}
            >
              {stopping ? "Deleting..." : "Stop watching"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={mode === "watch"}
        onOpenChange={(open) => {
          if (!open && !running) setMode("closed");
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Watch favorites</DialogTitle>
            <DialogDescription>
              Pick the pairs and the alerts to create. Existing alerts stay; new ones are added.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium">Pairs ({selectedPairs.length})</p>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={running}
                  onClick={() =>
                    setSelectedPairs(
                      selectedPairs.length === favorites.length ? [] : favorites.map(pairKey),
                    )
                  }
                >
                  {selectedPairs.length === favorites.length ? "Clear" : "Select all"}
                </Button>
              </div>
              <div className="grid max-h-40 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
                {favorites.map((pair) => {
                  const key = pairKey(pair);
                  return (
                    <label key={key} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={selectedPairs.includes(key)}
                        disabled={running}
                        onCheckedChange={() => setSelectedPairs(toggle(selectedPairs, key))}
                      />
                      {pairLabel(pair)}
                    </label>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium">Alerts</p>
              <div className="grid grid-cols-2 gap-2">
                {WATCH_TYPES.map((type) => (
                  <label
                    key={type}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
                      selectedTypes.includes(type) ? "border-primary/40 bg-primary/10" : "border-border",
                    )}
                  >
                    <Checkbox
                      checked={selectedTypes.includes(type)}
                      disabled={running}
                      onCheckedChange={() => setSelectedTypes(toggle(selectedTypes, type))}
                    />
                    {WATCH_TYPE_LABELS[type]}
                  </label>
                ))}
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Notify via {defaultNotifyLabel(channel)} (and in-app sound).{" "}
              <Link href="/settings" className="text-primary underline-offset-4 hover:underline">
                Change in Settings
              </Link>
              . PDH/PDL expires at the end of the UTC day. The others expire in 24 hours.
            </p>

            {watchNeedsMessage(channel) ? (
              <div className="space-y-1">
                <label htmlFor="watch-message" className="text-sm font-medium">
                  Message for {defaultNotifyLabel(channel)} alerts
                </label>
                <Textarea
                  id="watch-message"
                  value={message}
                  disabled={running}
                  maxLength={watchMessageMaxChars(channel)}
                  rows={2}
                  onChange={(event) => setMessage(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Required for Call and SMS. Sent with every alert in this run, along with the pair,
                  type and price.
                </p>
              </div>
            ) : null}

            {existingForSelection > 0 ? (
              <p className="text-xs text-muted-foreground">
                You already have {existingForSelection} active alert
                {existingForSelection === 1 ? "" : "s"} of these types on the selected pairs. New
                ones are added alongside.
              </p>
            ) : null}

            {check.ok ? (
              <p className="text-sm">
                This creates <span className="font-semibold">{check.total}</span> alert
                {check.total === 1 ? "" : "s"}.
              </p>
            ) : (
              <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {check.error}
              </p>
            )}

            {results && results.length > 0 ? (
              <div className="space-y-1 rounded-md border border-border p-3 text-sm">
                <p className="font-medium">
                  {running ? "Creating..." : typeSummaryLabel(results)}
                </p>
                {results.map((r, index) => (
                  <p key={`${r.step.type}-${index}`} className={r.ok ? "" : "text-destructive"}>
                    {WATCH_TYPE_LABELS[r.step.type]} ({r.step.pairs.length}):{" "}
                    {r.ok ? "created" : `failed: ${r.message}`}
                  </p>
                ))}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button
                disabled={
                  running ||
                  !check.ok ||
                  Boolean(results && results.length > 0 && results.every((r) => r.ok))
                }
                onClick={startWatch}
              >
                {running ? "Creating..." : "Create alerts"}
              </Button>
              {!running && results?.some((r) => !r.ok) ? (
                <Button variant="outline" onClick={retryFailed}>
                  Retry failed
                </Button>
              ) : null}
              {!running && results && results.length > 0 && results.every((r) => r.ok) ? (
                <Button variant="outline" onClick={openView}>
                  View
                </Button>
              ) : null}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
