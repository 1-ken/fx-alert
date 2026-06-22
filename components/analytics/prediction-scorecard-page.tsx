"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useObserverSnapshot } from "@/hooks/snapshot/use-snapshot";
import {
  PREDICTION_CACHE_TTL_MS,
  usePredictionScorecard,
} from "@/hooks/analytics/use-prediction-scorecard";
import { formatTradingDayLabel } from "@/lib/daily-trading-day";
import { biasLabel, drawLabel } from "@/lib/draw-on-liquidity";
import {
  pairToInstrumentSlug,
  predictionStatusLabel,
  type PredictionRecord,
  type PredictionStatus,
} from "@/lib/prediction-scorecard";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | PredictionStatus;

function normalizePairKey(pair: string): string {
  return pair.replace(/[^a-z0-9]/gi, "").toUpperCase();
}

function formatPairLabel(pair: string): string {
  const compact = normalizePairKey(pair);
  if (compact.length === 6) {
    return `${compact.slice(0, 3)}/${compact.slice(3)}`;
  }
  return compact;
}

function statusBadgeClass(status: PredictionStatus): string {
  if (status === "hit") {
    return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400";
  }
  if (status === "miss") {
    return "bg-red-500/15 text-red-700 dark:text-red-400";
  }
  if (status === "pending") {
    return "bg-amber-500/15 text-amber-700 dark:text-amber-400";
  }
  return "bg-muted text-muted-foreground";
}

function priceDecimals(value: number): number {
  if (value >= 100) {
    return 3;
  }
  if (value >= 10) {
    return 4;
  }
  return 5;
}

function formatTime(isoMs: number): string {
  return new Date(isoMs).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRefreshCountdown(msRemaining: number): string {
  const totalSeconds = Math.max(0, Math.ceil(msRemaining / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

/**
 * Today's draw-on-liquidity predictions across all dashboard-streamed pairs.
 */
export function PredictionScorecardPageContent() {
  const { data: snapshot } = useObserverSnapshot(false);
  const { data, isLoading, error, load, canRefresh, nextRefreshAt, lastFetchedAt } =
    usePredictionScorecard();
  const [filter, setFilter] = useState<StatusFilter>("all");
  const initialLoadDone = useRef(false);
  const pairsAtLoad = useRef<string[]>([]);

  const pairs = useMemo(() => {
    const streamed = (snapshot?.pairs ?? []).map((p) => normalizePairKey(p.pair));
    return Array.from(new Set(streamed)).sort();
  }, [snapshot?.pairs]);

  useEffect(() => {
    if (initialLoadDone.current || pairs.length === 0) {
      return;
    }
    initialLoadDone.current = true;
    pairsAtLoad.current = pairs;
    void load({ pairs });
  }, [pairs, load]);

  const refresh = () => {
    void load({ pairs: pairsAtLoad.current, force: true });
  };

  const refreshInMs =
    nextRefreshAt != null ? Math.max(0, nextRefreshAt - Date.now()) : 0;

  const filteredRecords = useMemo(() => {
    if (!data?.records) {
      return [];
    }
    if (filter === "all") {
      return data.records;
    }
    return data.records.filter((row) => row.status === filter);
  }, [data?.records, filter]);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Today&apos;s predictions</h1>
        <p className="text-sm text-muted-foreground">
          Draw-on-liquidity forecast for every instrument on your dashboard stream
          today. Right = draw target reached; Wrong = missed; Pending = still open.
          Analysis refreshes at most every 5 minutes.
        </p>
      </header>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Controls</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <Button
            type="button"
            className="h-11"
            onClick={refresh}
            disabled={isLoading || pairsAtLoad.current.length === 0 || !canRefresh}
          >
            {isLoading ? (
              <Spinner className="mr-2 h-4 w-4" />
            ) : (
              <ArrowPathIcon className="mr-2 h-4 w-4" />
            )}
            Refresh
          </Button>
          <div className="space-y-0.5 text-xs text-muted-foreground">
            <p>
              {pairsAtLoad.current.length} instrument
              {pairsAtLoad.current.length === 1 ? "" : "s"} · UTC trading day
            </p>
            {lastFetchedAt != null ? (
              <p>Last updated {formatTime(lastFetchedAt)}</p>
            ) : null}
            {!canRefresh && nextRefreshAt != null && !isLoading ? (
              <p>
                Refresh in {formatRefreshCountdown(refreshInMs)} (max every{" "}
                {PREDICTION_CACHE_TTL_MS / 60_000} min)
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {error ? (
        <Card>
          <CardContent className="py-6 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : null}

      {isLoading && !data ? (
        <Card>
          <CardContent className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Spinner className="h-4 w-4" />
            Running today&apos;s analysis…
          </CardContent>
        </Card>
      ) : null}

      {data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="py-4">
                <p className="text-xs text-muted-foreground">Right</p>
                <p className="text-xl font-semibold text-emerald-600 dark:text-emerald-400">
                  {data.summary.hit}
                  {data.summary.evaluated_days > 0 ? (
                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                      ({data.summary.hit_rate}%)
                    </span>
                  ) : null}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4">
                <p className="text-xs text-muted-foreground">Wrong</p>
                <p className="text-xl font-semibold text-red-600 dark:text-red-400">
                  {data.summary.miss}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4">
                <p className="text-xs text-muted-foreground">Pending</p>
                <p className="text-xl font-semibold text-amber-600 dark:text-amber-400">
                  {data.summary.pending}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4">
                <p className="text-xs text-muted-foreground">No draw</p>
                <p className="text-xl font-semibold">{data.summary.none}</p>
              </CardContent>
            </Card>
          </div>

          <Tabs
            value={filter}
            onValueChange={(value) => setFilter(value as StatusFilter)}
          >
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="hit">Right</TabsTrigger>
              <TabsTrigger value="miss">Wrong</TabsTrigger>
              <TabsTrigger value="pending">Pending</TabsTrigger>
            </TabsList>
          </Tabs>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                Today&apos;s results ({filteredRecords.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {filteredRecords.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No rows for this filter.
                </p>
              ) : (
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="py-2 pr-3">Pair</th>
                      <th className="py-2 pr-3">Trading day</th>
                      <th className="py-2 pr-3">Bias</th>
                      <th className="py-2 pr-3">Draw target</th>
                      <th className="py-2 pr-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRecords.map((row) => (
                      <PredictionRow key={`${row.pair}-${row.tradingDay}`} row={row} />
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

function PredictionRow({ row }: { row: PredictionRecord }) {
  const slug = pairToInstrumentSlug(row.pair);
  const target =
    row.drawTargetPrice != null
      ? `${drawLabel(row.predictedDraw)} ${row.drawTargetPrice.toFixed(priceDecimals(row.drawTargetPrice))}`
      : "—";

  return (
    <tr className="border-b/50 border-b">
      <td className="py-2 pr-3">
        <Link
          href={`/instruments/${slug}`}
          className="font-medium text-primary hover:underline"
        >
          {formatPairLabel(row.pair)}
        </Link>
      </td>
      <td className="py-2 pr-3 text-xs">
        {formatTradingDayLabel(`${row.tradingDay}T00:00:00Z`)}
      </td>
      <td className="py-2 pr-3 capitalize">{biasLabel(row.predictedBias)}</td>
      <td className="py-2 pr-3 font-mono text-xs">{target}</td>
      <td className="py-2 pr-3">
        <Badge className={cn("font-normal", statusBadgeClass(row.status))}>
          {predictionStatusLabel(row.status)}
        </Badge>
      </td>
    </tr>
  );
}
