"use client";

import Link from "next/link";
import { useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import {
  ArrowLeftIcon,
  BellAlertIcon,
  SparklesIcon,
  StarIcon,
} from "@heroicons/react/24/outline";
import { StarIcon as StarSolidIcon } from "@heroicons/react/24/solid";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  InteractiveTradingChart,
  type ChartAlertDraft,
} from "@/components/charts/interactive-trading-chart";
import { ChartAlertSheet } from "@/components/alerts/chart-alert-sheet";
import { useObserverAlerts } from "@/hooks/alerts/use-alerts";
import { useFavorites } from "@/hooks/favorites/use-favorites";
import { useObserverStreamContext } from "@/components/stream-alerts-provider";
import { useDrawOnLiquidity } from "@/hooks/historical/use-draw-on-liquidity";
import {
  biasLabel,
  drawLabel,
  outcomeLabel,
  type LiveBias,
  type LiveBiasDetails,
} from "@/lib/draw-on-liquidity";
import { formatTradingDayLabel } from "@/lib/daily-trading-day";
import { formatKenyaDateTime } from "@/lib/datetime";

function decodePairSlug(slug: string): string {
  const compact = decodeURIComponent(slug).replace(/[^a-z0-9]/gi, "").toUpperCase();
  if (compact.length === 6) {
    return `${compact.slice(0, 3)}/${compact.slice(3)}`;
  }
  return compact;
}

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

/**
 * Pair detail page with interactive chart, alerts list, and contextual create-alert FAB.
 */
export function PairDetailPageContent() {
  const params = useParams<{ pair: string }>();
  const searchParams = useSearchParams();
  const pair = decodePairSlug(params.pair ?? "");
  const pairKey = normalizePairKey(pair);

  const { snapshot } = useObserverStreamContext();
  const { alerts } = useObserverAlerts();
  const { isFavorite, toggleFavorite } = useFavorites();

  const [alertDraft, setAlertDraft] = useState<ChartAlertDraft | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [showBias, setShowBias] = useState(false);

  const rawQueryPrice = searchParams.get("price");
  const queryPrice = rawQueryPrice
    ? (() => {
        const parsed = Number(rawQueryPrice);
        return Number.isFinite(parsed) ? parsed : undefined;
      })()
    : undefined;

  const livePrice = snapshot?.pairs.find(
    (item) => normalizePairKey(item.pair) === pairKey,
  )?.price;

  const displayPrice = livePrice ?? queryPrice;

  const {
    live: todayBias,
    details: biasDetails,
    isLoading: biasLoading,
    isError: biasError,
    refresh: refreshBias,
  } = useDrawOnLiquidity(showBias ? pair : "", displayPrice);

  const pairAlerts = [...alerts.active, ...alerts.triggered]
    .filter((alert) => normalizePairKey(alert.pair) === pairKey)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  const favorited = isFavorite(pair);

  const handleCreateAlert = (draft: ChartAlertDraft) => {
    setAlertDraft(draft);
    setSheetOpen(true);
  };

  return (
    <div className="relative min-h-screen bg-background pb-28">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 md:p-6">
        <header className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon" className="h-10 w-10">
            <Link href="/dashboard" aria-label="Back to dashboard">
              <ArrowLeftIcon className="h-5 w-5" />
            </Link>
          </Button>
          <div className="flex-1">
            <button
              type="button"
              className="text-left text-2xl font-semibold hover:text-primary"
              onClick={() =>
                handleCreateAlert({
                  pair,
                  alertType: "candle_close",
                  price: displayPrice ?? 0,
                  interval: "5m",
                })
              }
            >
              {formatPairLabel(pair)}
            </button>
            {typeof displayPrice === "number" ? (
              <button
                type="button"
                className="font-mono text-lg text-primary hover:underline"
                onClick={() =>
                  handleCreateAlert({
                    pair,
                    alertType: "price",
                    price: displayPrice,
                    interval: "5m",
                  })
                }
              >
                {displayPrice}
              </button>
            ) : null}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={favorited ? "Remove favorite" : "Add favorite"}
            onClick={() => void toggleFavorite(pair)}
          >
            {favorited ? (
              <StarSolidIcon className="h-6 w-6 text-amber-500" />
            ) : (
              <StarIcon className="h-6 w-6 text-muted-foreground" />
            )}
          </Button>
        </header>

        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Today&apos;s bias</h2>
          <Button
            type="button"
            variant={showBias ? "secondary" : "outline"}
            size="sm"
            onClick={() => setShowBias((prev) => !prev)}
          >
            <SparklesIcon className="mr-2 h-4 w-4" />
            {showBias ? "Hide bias" : "Determine bias"}
          </Button>
        </div>

        {showBias ? (
          <TodayBiasCard
            loading={biasLoading}
            error={biasError}
            bias={todayBias}
            details={biasDetails}
            onRetry={refreshBias}
          />
        ) : null}

        <section data-tour="pair-chart-alert">
        <InteractiveTradingChart
          pair={pair}
          livePrice={displayPrice}
          onCreateAlert={handleCreateAlert}
        />
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Alerts for this pair</h2>
            <Badge variant="outline">{pairAlerts.length}</Badge>
          </div>

          {pairAlerts.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                No alerts yet for this instrument.
              </CardContent>
            </Card>
          ) : (
            pairAlerts.map((alert) => (
              <Card key={alert.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base capitalize">
                    {alert.alert_type.replace("_", " ")} · {alert.status}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p>
                    Target:{" "}
                    <span className="font-mono">
                      {alert.target_price ?? alert.threshold ?? "—"}
                    </span>
                  </p>
                  <p className="text-muted-foreground">
                    Channel: {alert.channel} · Created {formatKenyaDateTime(alert.created_at)}
                  </p>
                  {alert.triggered_at ? (
                    <p className="text-muted-foreground">
                      Triggered {formatKenyaDateTime(alert.triggered_at)}
                    </p>
                  ) : null}
                  {alert.status !== "triggered" ? (
                    <Button asChild variant="outline" size="sm" className="mt-2">
                      <Link href={`/alerts/${alert.id}`}>Edit alert</Link>
                    </Button>
                  ) : null}
                </CardContent>
              </Card>
            ))
          )}
        </section>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-40 pointer-events-none">
        <div className="mx-auto flex w-full max-w-4xl justify-end px-4 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-6">
          <div className="pointer-events-auto" data-tour="pair-create-alert-fab">
            <Button asChild size="lg" className="h-auto rounded-full px-4 py-3 shadow-xl">
              <Link
                href={`/alerts?pair=${encodeURIComponent(pair)}`}
                className="flex items-center gap-3"
              >
                <BellAlertIcon className="h-5 w-5" />
                <span>Create Alert</span>
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <ChartAlertSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        draft={alertDraft}
      />
    </div>
  );
}

function biasBadgeClass(bias: LiveBias["bias"]): string {
  if (bias === "bullish") {
    return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400";
  }
  if (bias === "bearish") {
    return "bg-red-500/15 text-red-600 dark:text-red-400";
  }
  return "bg-muted text-muted-foreground";
}

function TodayBiasCard({
  loading,
  error,
  bias,
  details,
  onRetry,
}: {
  loading: boolean;
  error: boolean;
  bias: LiveBias | null;
  details: LiveBiasDetails | null;
  onRetry: () => void;
}) {
  if (loading && !bias) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Spinner className="h-4 w-4" />
          Computing today&apos;s bias from daily history…
        </CardContent>
      </Card>
    );
  }

  if (error && !bias) {
    return (
      <Card>
        <CardContent className="flex flex-col items-start gap-3 py-6 text-sm text-muted-foreground">
          <span>Couldn&apos;t load daily history. The market data source may be busy.</span>
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!bias) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground">
          Not enough daily history to determine today&apos;s bias yet.
        </CardContent>
      </Card>
    );
  }

  const drawTarget = drawLabel(bias.draw);
  const status = !bias.hasIntradayData
    ? "Waiting for today's daily bar"
    : bias.drawReached
      ? "Draw target reached"
      : bias.displacedUp
        ? "Displaced above PDH"
        : bias.displacedDown
          ? "Displaced below PDL"
          : bias.sweptHigh
            ? "Swept PDH"
            : bias.sweptLow
              ? "Swept PDL"
              : "Inside the previous-day range";

  const priceDecimals =
    bias.pdh >= 100 ? 3 : bias.pdh >= 10 ? 4 : 5;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">Model prediction for today</CardTitle>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${biasBadgeClass(bias.bias)}`}
          >
            {biasLabel(bias.bias)}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Uses cTrader UTC daily candles. TradingView NY session levels may differ.
        </p>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Draw on liquidity</p>
            <p className="font-medium">
              {drawTarget === "—" ? "No directional draw" : `Toward ${drawTarget}`}
            </p>
            {bias.drawTargetPrice != null ? (
              <p className="font-mono text-xs text-muted-foreground">
                Target {bias.drawTargetPrice.toFixed(priceDecimals)}
              </p>
            ) : null}
          </div>
          <div>
            <p className="text-xs text-muted-foreground">PDH</p>
            <p className="font-mono">{bias.pdh.toFixed(priceDecimals)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">PDL</p>
            <p className="font-mono">{bias.pdl.toFixed(priceDecimals)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Status</p>
            <p className="font-medium">{status}</p>
          </div>
        </div>

        {details ? (
          <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs">
            <p className="mb-2 font-medium text-foreground">Reference (trading day, UTC)</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <p className="text-muted-foreground">
                  PDH/PDL from {formatTradingDayLabel(`${details.pdhReferenceDate}T00:00:00Z`)}
                </p>
                <p className="font-mono">
                  H {details.pdhReference.high.toFixed(priceDecimals)} · L{" "}
                  {details.pdhReference.low.toFixed(priceDecimals)} · C{" "}
                  {details.pdhReference.close.toFixed(priceDecimals)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">
                  Bias set by {formatTradingDayLabel(`${details.classifiedDate}T00:00:00Z`)}{" "}
                  ({outcomeLabel(details.classified.outcome)})
                </p>
                <p className="font-mono">
                  H {details.classified.high.toFixed(priceDecimals)} · L{" "}
                  {details.classified.low.toFixed(priceDecimals)} · C{" "}
                  {details.classified.close.toFixed(priceDecimals)}
                </p>
              </div>
            </div>
            <p className="mt-2 text-muted-foreground">
              Today&apos;s forming bar:{" "}
              {details.todayForming ? (
                <span className="font-mono text-foreground">
                  H {details.todayForming.high.toFixed(priceDecimals)} · L{" "}
                  {details.todayForming.low.toFixed(priceDecimals)}
                </span>
              ) : (
                "not available yet"
              )}
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
