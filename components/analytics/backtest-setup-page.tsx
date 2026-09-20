"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { BacktestSetupChart } from "@/components/analytics/backtest-setup-chart";
import type { ChartInterval } from "@/lib/chart-utils";
import {
  defaultIntervalForStrategy,
  isChartInterval,
  resolveBacktestSetup,
  setupStrategy,
  STRATEGY_LABELS,
  type BacktestSetup,
} from "@/lib/backtest-setup";
import { formatKenyaCompactDateTime } from "@/lib/datetime";
import { biasLabel, outcomeLabel } from "@/lib/draw-on-liquidity";

function formatPrice(value: number): string {
  return value.toFixed(5);
}

export function BacktestSetupPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pair = searchParams.get("pair");
  const strategy = searchParams.get("strategy");
  const time = searchParams.get("time");
  const intervalParam = searchParams.get("interval");

  const [setup, setSetup] = useState<BacktestSetup | null>(null);
  const [ready, setReady] = useState(false);
  const [interval, setInterval] = useState<ChartInterval>(() =>
    isChartInterval(intervalParam)
      ? intervalParam
      : defaultIntervalForStrategy(
          strategy === "liquidity_sweep" || strategy === "pdhl_cisd"
            ? strategy
            : "draw_on_liquidity",
        ),
  );

  useEffect(() => {
    const resolved = resolveBacktestSetup({ pair, strategy, time });
    setSetup(resolved);
    setReady(true);
    if (isChartInterval(intervalParam)) {
      setInterval(intervalParam);
    } else if (resolved) {
      setInterval(defaultIntervalForStrategy(setupStrategy(resolved)));
    }
  }, [pair, strategy, time, intervalParam]);

  const onIntervalChange = (next: ChartInterval) => {
    setInterval(next);
    const params = new URLSearchParams(searchParams.toString());
    params.set("interval", next);
    router.replace(`/backtest/setup?${params.toString()}`, { scroll: false });
  };

  const summary = useMemo(() => {
    if (!setup) {
      return null;
    }
    if (setup.kind === "draw_on_liquidity") {
      const { day } = setup;
      return {
        title: STRATEGY_LABELS.draw_on_liquidity,
        time: formatKenyaCompactDateTime(day.date),
        lines: [
          `Outcome: ${outcomeLabel(day.outcome)}`,
          `Bias → next: ${biasLabel(day.bias)}`,
          `PDH ${formatPrice(day.pdh)} · PDL ${formatPrice(day.pdl)} · Close ${formatPrice(day.close)}`,
          `Draw hit: ${day.draw_hit === null ? "—" : day.draw_hit ? "yes" : "no"}`,
        ],
      };
    }
    const { trade } = setup;
    return {
      title: STRATEGY_LABELS[setup.strategy],
      time: formatKenyaCompactDateTime(trade.time),
      lines: [
        `${trade.side} · ${trade.result}${trade.rr === null ? "" : ` · ${trade.rr}R`}`,
        `Entry ${formatPrice(trade.entry)} · Stop ${formatPrice(trade.sl)} · Target ${formatPrice(trade.tp)}`,
        `Sweep ${formatPrice(trade.sweep_level)}`,
        trade.exit_time
          ? `Exit ${formatKenyaCompactDateTime(trade.exit_time)}`
          : "Still open at end of range",
      ],
    };
  }, [setup]);

  if (!ready) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner className="h-5 w-5" />
      </div>
    );
  }

  if (!setup) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-4 p-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/backtest">
            <ArrowLeftIcon className="mr-1 h-4 w-4" />
            Back to backtest
          </Link>
        </Button>
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            This setup is no longer available. Run the backtest again and open a
            row from the results table.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-4">
      <header className="flex items-start gap-3">
        <Button variant="ghost" size="icon" className="mt-0.5 h-10 w-10" asChild>
          <Link href="/backtest" aria-label="Back to backtest">
            <ArrowLeftIcon className="h-5 w-5" />
          </Link>
        </Button>
        <div className="min-w-0 space-y-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {summary?.title} · UTC+3
          </p>
          <h1 className="text-2xl font-semibold">{setup.pair}</h1>
          <p className="text-sm text-muted-foreground">{summary?.time}</p>
        </div>
      </header>

      {summary ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Setup</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {summary.lines.map((line) => (
              <p key={line} className="text-sm text-muted-foreground">
                {line}
              </p>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <BacktestSetupChart
        setup={setup}
        interval={interval}
        onIntervalChange={onIntervalChange}
      />
    </div>
  );
}
