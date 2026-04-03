"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  BellAlertIcon,
  BellIcon,
  MagnifyingGlassIcon,
  SignalIcon,
} from "@heroicons/react/24/outline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { BottomNav } from "@/components/mobile/bottom-nav";
import { cn } from "@/lib/utils";
import { useObserverAlerts } from "@/hooks/alerts/use-alerts";
import { useObserverStream } from "@/hooks/snapshot/use-stream";

function formatPairLabel(pair: string): string {
  const cleanPair = pair.replace("/", "").toUpperCase();
  if (cleanPair.length === 6) {
    return `${cleanPair.slice(0, 3)}/${cleanPair.slice(3)}`;
  }
  return cleanPair;
}

function normalizePairSearchValue(value: string): string {
  return value.replace(/[^a-z0-9]/gi, "").toUpperCase();
}

function buildCreateAlertHref(pair: string, price: number): string {
  const params = new URLSearchParams({
    pair,
    price: price.toString(),
  });

  return `/alerts?${params.toString()}`;
}

function formatPrice(price: number): string {
  if (!Number.isFinite(price)) {
    return "0.0000";
  }

  if (price >= 100) {
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(price);
  }

  return price.toFixed(4);
}

function formatRelativeTime(isoDate: string | null): string {
  if (!isoDate) {
    return "No update yet";
  }

  const milliseconds = Date.now() - new Date(isoDate).getTime();
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));

  if (seconds < 60) {
    return `${seconds}s ago`;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  return new Date(isoDate).toLocaleTimeString();
}

export function DashboardPageContent() {
  const {
    snapshot,
    alerts: streamAlerts,
    status,
    lastUpdatedAt,
    lastStreamTickAt,
    isSnapshotLoading,
    changeMap,
  } = useObserverStream();
  const { alerts } = useObserverAlerts();

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(normalizePairSearchValue(query.trim()));
    }, 300);

    return () => {
      clearTimeout(timer);
    };
  }, [query]);

  const filteredPairs = useMemo(() => {
    const pairs = snapshot?.pairs ?? [];
    if (!debouncedQuery) {
      return pairs;
    }

    return pairs.filter((item) =>
      normalizePairSearchValue(item.pair).includes(debouncedQuery)
    );
  }, [debouncedQuery, snapshot?.pairs]);

  const cards = useMemo(() => {
    return filteredPairs.map((item, index) => {
      const key = item.pair.toUpperCase();
      const movement = changeMap[key] ?? { delta: 0, deltaPercent: 0 };
      const instrumentKey = [
        item.pair,
        item.common_name ?? "",
        item.category ?? "",
        String(index),
      ].join("|");

      return {
        ...item,
        instrumentKey,
        delta: movement.delta,
        deltaPercent: movement.deltaPercent,
      };
    });
  }, [changeMap, filteredPairs]);

  const isMarketOpen = snapshot?.market_status === "open";
  const marketText = isMarketOpen ? "MARKET OPEN" : "MARKET CLOSED";
  const activeAlertsCount = streamAlerts.active.length || alerts?.active.length || 0;
  const triggeredAlertsCount = streamAlerts.triggered.length || alerts?.triggered.length || 0;

  const connectionLabel =
    status === "live" ? "Live" : status === "reconnecting" ? "Reconnecting" : "Offline";

  const connectionStatusVariant = status === "live" ? "default" : "secondary";
  const streamTickLabel = formatRelativeTime(lastStreamTickAt);

  return (
    <div className="relative min-h-screen bg-background pb-24">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 md:p-6">
        <header className="rounded-xl border bg-card/80 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-primary/15 p-3 text-primary">
                <SignalIcon className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl font-semibold">Finance Observer</h1>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                  <Badge
                    variant={isMarketOpen ? "default" : "secondary"}
                    className="rounded-full px-2.5"
                  >
                    {marketText}
                  </Badge>
                  <Badge
                    variant={connectionStatusVariant}
                    className={cn(
                      "rounded-full px-2.5",
                      status === "live" && "bg-green-500/15 text-green-700 dark:text-green-400",
                      status === "reconnecting" && "animate-pulse",
                      status === "offline" && "bg-red-500/15 text-red-700 dark:text-red-400"
                    )}
                  >
                    {status === "live" && "🟢"} {connectionLabel}
                  </Badge>
                  <span className="text-muted-foreground">
                    • Last stream tick: {streamTickLabel}
                  </span>
                </div>
              </div>
            </div>
            <ThemeSwitcher />
          </div>
        </header>

        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Link href="/alerts/list?status=active" className="block">
            <Card className="gap-3 py-4 transition hover:border-primary/40 hover:bg-card cursor-pointer">
              <CardContent className="px-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Active alerts</p>
                <p className="mt-1 text-2xl font-semibold">{activeAlertsCount}</p>
              </CardContent>
            </Card>
          </Link>
          <Link href="/alerts/list?status=triggered" className="block">
            <Card className="gap-3 py-4 transition hover:border-primary/40 hover:bg-card cursor-pointer">
              <CardContent className="px-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Triggered</p>
                <p className="mt-1 text-2xl font-semibold">{triggeredAlertsCount}</p>
              </CardContent>
            </Card>
          </Link>
        </section>

        
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-wide text-muted-foreground">
              LIVE PRICE GRID
            </h2>
            <Badge variant="outline" className="rounded-full px-3 py-1">
              {cards.length} instruments
            </Badge>
          </div>

          <div className="relative mb-4">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search pair (e.g. EURUSD)"
              aria-label="Search forex pairs"
              className="pl-9"
            />
          </div>

          {isSnapshotLoading && cards.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Loading market snapshot...
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {cards.map((item) => {
                const isUp = item.delta >= 0;

                return (
                  <Link
                    key={item.instrumentKey}
                    href={buildCreateAlertHref(item.pair, item.price)}
                    aria-label={`Create alert for ${item.pair}`}
                    className="block"
                  >
                    <Card className="gap-4 rounded-2xl border-primary/20 bg-background/60 py-5 transition hover:border-primary/40 hover:bg-card cursor-pointer">
                      <CardHeader className="px-4">
                        <div className="flex items-start justify-between gap-2">
                          <CardTitle className="text-2xl font-semibold tracking-tight">
                            {formatPairLabel(item.pair)}
                          </CardTitle>
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-xs font-medium",
                              isUp ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive"
                            )}
                          >
                            {isUp ? "UP" : "DOWN"}
                          </span>
                        </div>
                      </CardHeader>
                      <CardContent className="px-4">
                        <div>
                          <div>
                            <p className="text-sm text-muted-foreground">Price</p>
                            <p className={cn("font-mono text-3xl", isUp ? "text-primary" : "text-destructive")}>
                              {formatPrice(item.price)}
                            </p>
                          </div>
                        </div>

                        <div className="mt-4 flex items-center justify-between">
                          <p className={cn("text-sm font-semibold", isUp ? "text-primary" : "text-destructive")}>
                            {isUp ? "▲" : "▼"} {Math.abs(item.deltaPercent).toFixed(2)}%
                          </p>
                          <span className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground">
                            <BellIcon className="h-4 w-4" />
                            Create alert
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        

        <footer className="flex items-center justify-between rounded-xl border bg-card/70 p-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <BellAlertIcon className="h-4 w-4" />
            Alert checks run only when market is open
          </span>
          <span>Updated: {formatRelativeTime(lastUpdatedAt)}</span>
        </footer>
      </div>

      <BottomNav />
    </div>
  );
}
