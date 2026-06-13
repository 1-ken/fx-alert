"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  BellAlertIcon,
  MagnifyingGlassIcon,
  SignalIcon,
  StarIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { StarIcon as StarSolidIcon } from "@heroicons/react/24/solid";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { BottomNav } from "@/components/mobile/bottom-nav";
import { TourFab } from "@/components/product-tour/tour-fab";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { formatKenyaRelative } from "@/lib/datetime";
import { buildInstrumentPairUrl } from "@/lib/instrument-navigation";
import { prefetchPairOhlc } from "@/lib/chart-prefetch";
// import { StreamHealthBadge } from "@/components/dashboard/stream-health-badge";
import { useObserverAlerts } from "@/hooks/alerts/use-alerts";
import { useNotificationCenter } from "@/hooks/alerts/use-notification-center";
import { useFavorites } from "@/hooks/favorites/use-favorites";
import { useObserverStreamContext } from "@/components/stream-alerts-provider";

type DashboardTab = "favorites" | "currency" | "commodity" | "index" | "all";

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

/**
 * Dashboard instrument grid with category tabs, favorites, and navigation to pair charts.
 */
export function DashboardPageContent() {
  const router = useRouter();
  const {
    snapshot,
    status,
    lastUpdatedAt,
    lastStreamTickAt,
    isSnapshotLoading,
    changeMap,
  } = useObserverStreamContext();
  const { alerts, hasFetched, isInitialLoading: alertsLoading } = useObserverAlerts();
  const { unseenSinceVisit, markVisitNow } = useNotificationCenter(
    alerts.triggered,
    hasFetched,
  );
  const { favorites, isFavorite, toggleFavorite } = useFavorites();

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [activeTab, setActiveTab] = useState<DashboardTab>("all");
  const [dismissedAtUnseenCount, setDismissedAtUnseenCount] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(normalizePairSearchValue(query.trim()));
    }, 300);

    return () => {
      clearTimeout(timer);
    };
  }, [query]);

  const favoriteSet = useMemo(
    () => new Set(favorites.map((pair) => normalizePairSearchValue(pair))),
    [favorites],
  );

  const filteredPairs = useMemo(() => {
    let pairs = snapshot?.pairs ?? [];

    if (activeTab === "favorites") {
      pairs = pairs.filter((item) =>
        favoriteSet.has(normalizePairSearchValue(item.pair)),
      );
    } else if (activeTab !== "all") {
      pairs = pairs.filter((item) => item.category === activeTab);
    }

    if (!debouncedQuery) {
      return pairs;
    }

    return pairs.filter((item) =>
      normalizePairSearchValue(item.pair).includes(debouncedQuery),
    );
  }, [activeTab, debouncedQuery, favoriteSet, snapshot?.pairs]);

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
  const activeAlertsCount = alerts.active.length;
  const triggeredAlertsCount = alerts.triggered.length;

  const activeAlertsByPair = useMemo(() => {
    const map = new Map<string, number>();
    for (const alert of alerts.active) {
      const key = normalizePairSearchValue(alert.pair);
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [alerts.active]);

  const bannerItems = useMemo(() => unseenSinceVisit.slice(0, 3), [unseenSinceVisit]);

  const unseenCount = unseenSinceVisit.length;
  const showTriggeredBanner =
    !alertsLoading &&
    unseenCount > 0 &&
    dismissedAtUnseenCount !== unseenCount;

  const dismissTriggeredBanner = () => {
    setDismissedAtUnseenCount(unseenCount);
    markVisitNow();
  };

  const connectionLabel =
    status === "live" ? "Live" : status === "reconnecting" ? "Reconnecting" : "Offline";

  const connectionStatusVariant = status === "live" ? "default" : "secondary";
  const streamTickLabel = formatKenyaRelative(lastStreamTickAt);

  const openPairPage = (pair: string, price: number) => {
    router.push(buildInstrumentPairUrl(pair, price));
  };

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
                      status === "offline" && "bg-red-500/15 text-red-700 dark:text-red-400",
                    )}
                  >
                    {status === "live" && "🟢"} {connectionLabel}
                  </Badge>
                  {/* <span className="text-muted-foreground">
                    • Last stream tick: {streamTickLabel}
                  </span> */}
                </div>
                {/* <StreamHealthBadge /> */}
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

        {showTriggeredBanner ? (
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="space-y-3 px-4 py-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">
                    {unseenSinceVisit.length} alert
                    {unseenSinceVisit.length === 1 ? "" : "s"} triggered since you were away
                  </p>
                  <Link
                    href="/alerts/list?status=triggered-today"
                    className="text-sm text-primary underline-offset-4 hover:underline"
                  >
                    View all triggered alerts
                  </Link>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  aria-label="Dismiss triggered alerts banner"
                  onClick={dismissTriggeredBanner}
                >
                  <XMarkIcon className="h-5 w-5" />
                </Button>
              </div>
              <ul className="space-y-2 text-sm">
                {bannerItems.map((item) => (
                  <li
                    key={item.triggerKey}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background/60 px-3 py-2"
                  >
                    <span className="font-medium">{formatPairLabel(item.pair)}</span>
                    <span className="text-muted-foreground">
                      {item.channel} · {formatKenyaRelative(item.triggeredAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as DashboardTab)}
        >
          <TabsList className="grid h-auto w-full grid-cols-3 gap-1 md:grid-cols-5">
            <TabsTrigger value="favorites">Favorites</TabsTrigger>
            <TabsTrigger value="currency">Currencies</TabsTrigger>
            <TabsTrigger value="commodity">Commodities</TabsTrigger>
            <TabsTrigger value="index">Indices</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>
        </Tabs>

        <div data-tour="dashboard-grid">
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

        {activeTab === "favorites" && cards.length === 0 && !isSnapshotLoading ? (
          <Card>
            <CardContent className="space-y-4 py-10 text-center">
              <StarIcon className="mx-auto h-8 w-8 text-muted-foreground" />
              <div>
                <p className="font-medium">No favorites yet</p>
                <p className="text-sm text-muted-foreground">
                  Star instruments to pin them here for quick access.
                </p>
              </div>
              <Button variant="outline" onClick={() => setActiveTab("all")}>
                Browse all pairs
              </Button>
            </CardContent>
          </Card>
        ) : isSnapshotLoading && cards.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Loading market snapshot...
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {cards.map((item, index) => {
              const isUp = item.delta >= 0;
              const favorited = isFavorite(item.pair);
              const pairAlertCount =
                activeAlertsByPair.get(normalizePairSearchValue(item.pair)) ?? 0;

              return (
                <Card
                  key={item.instrumentKey}
                  data-tour={index === 0 ? "dashboard-pair-card" : undefined}
                  role="button"
                  tabIndex={0}
                  aria-label={`View ${formatPairLabel(item.pair)} chart and alerts`}
                  onMouseEnter={() => prefetchPairOhlc(item.pair)}
                  onFocus={() => prefetchPairOhlc(item.pair)}
                  onClick={() => openPairPage(item.pair, item.price)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openPairPage(item.pair, item.price);
                    }
                  }}
                  className="min-h-[140px] gap-4 rounded-2xl border-primary/20 bg-background/60 py-5 transition hover:border-primary/40 hover:bg-card cursor-pointer"
                >
                  <CardHeader className="px-4">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-2xl font-semibold tracking-tight">
                        {formatPairLabel(item.pair)}
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-11 w-11 shrink-0"
                          aria-label={favorited ? "Remove favorite" : "Add favorite"}
                          onClick={(event) => {
                            event.stopPropagation();
                            void toggleFavorite(item.pair);
                          }}
                        >
                          {favorited ? (
                            <StarSolidIcon className="h-5 w-5 text-amber-500" />
                          ) : (
                            <StarIcon className="h-5 w-5 text-muted-foreground" />
                          )}
                        </Button>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-medium",
                            isUp ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive",
                          )}
                        >
                          {isUp ? "UP" : "DOWN"}
                        </span>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="px-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Price</p>
                      <p className={cn("font-mono text-3xl", isUp ? "text-primary" : "text-destructive")}>
                        {formatPrice(item.price)}
                      </p>
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-2">
                      <p className={cn("text-sm font-semibold", isUp ? "text-primary" : "text-destructive")}>
                        {isUp ? "▲" : "▼"} {Math.abs(item.deltaPercent).toFixed(2)}%
                      </p>
                      <div className="flex items-center gap-2">
                        {pairAlertCount > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                            <BellAlertIcon className="h-3.5 w-3.5" />
                            {pairAlertCount} active
                          </span>
                        ) : null}
                        <span className="text-xs uppercase text-muted-foreground">
                          {item.category ?? "currency"}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        </div>

        <footer className="flex items-center justify-between rounded-xl border bg-card/70 p-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <BellAlertIcon className="h-4 w-4" />
            Alert checks run only when market is open
          </span>
          <span>Updated: {formatKenyaRelative(lastUpdatedAt)}</span>
        </footer>
      </div>

      <BottomNav />
      <TourFab />
    </div>
  );
}
