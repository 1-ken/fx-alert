"use client";

import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { subDays, subMonths } from "date-fns";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DateRangePicker,
  type PresetOption,
} from "@/components/ui/date-range-picker";
import { Checkbox } from "@/components/ui/checkbox";
import { BacktestChart } from "@/components/analytics/backtest-chart";
import { useObserverSnapshot } from "@/hooks/snapshot/use-snapshot";
import { useBacktest } from "@/hooks/analytics/use-backtest";
import {
  backtestSetupUrl,
  saveBacktestSetup,
  type BacktestSetup,
} from "@/lib/backtest-setup";
import { CHART_INTERVAL_OPTIONS, type ChartInterval } from "@/lib/chart-utils";
import { formatKenyaCompactDateTime } from "@/lib/datetime";
import { outcomeLabel } from "@/lib/draw-on-liquidity";
import {
  backtestExportFilename,
  buildBacktestExportPayload,
  candlesExportFilename,
  downloadJsonFile,
} from "@/lib/backtest-export";
import {
  isTradeBacktest,
  type BacktestDay,
  type BacktestSide,
  type BacktestStats,
  type BacktestStrategy,
  type BacktestTrade,
  type TradeBacktestStats,
} from "@/types/analytics";

const fallbackPairs = [
  "EUR/USD",
  "GBP/USD",
  "USD/JPY",
  "AUD/USD",
  "USD/CHF",
  "USD/CAD",
  "NZD/USD",
];

function normalizePair(pair: string): string {
  const compact = pair.replace(/[^a-z0-9]/gi, "").toUpperCase();
  if (compact.length === 6 && /^[A-Z]{6}$/.test(compact)) {
    return `${compact.slice(0, 3)}/${compact.slice(3)}`;
  }
  return compact;
}

function defaultStart(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 3);
  return d.toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function rollingPresets(): PresetOption[] {
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  return [
    { label: "Today", getValue: () => ({ from: base, to: base }) },
    {
      label: "Yesterday",
      getValue: () => ({ from: subDays(base, 1), to: subDays(base, 1) }),
    },
    { label: "Last week", getValue: () => ({ from: subDays(base, 7), to: base }) },
    {
      label: "Last 2 weeks",
      getValue: () => ({ from: subDays(base, 14), to: base }),
    },
    { label: "Last month", getValue: () => ({ from: subDays(base, 30), to: base }) },
    { label: "Last 3 months", getValue: () => ({ from: subMonths(base, 3), to: base }) },
    { label: "Last 6 months", getValue: () => ({ from: subMonths(base, 6), to: base }) },
    { label: "Last year", getValue: () => ({ from: subMonths(base, 12), to: base }) },
  ];
}

const STRATEGIES: Array<{ value: BacktestStrategy; label: string; blurb: string }> = [
  {
    value: "draw_on_liquidity",
    label: "Draw on liquidity",
    blurb:
      "Replay the previous-day high/low model on daily candles to see how bias and draw targets performed.",
  },
  {
    value: "liquidity_sweep",
    label: "Liquidity sweep",
    blurb:
      "1H sweep then a 5m CISD at 2.5R, only in London open, New York, or early Asia. No Friday. Blow-off CISDs use a 50% limit, and the stop moves to entry at 1.2R.",
  },
  {
    value: "pdhl_cisd",
    label: "PDH/PDL CISD",
    blurb:
      "A 1H bar must trade through the previous day's 1H high or low before a 1H CISD, then the next hour continues on a 5m CISD at 2R.",
  },
];

const tradeStatRows: Array<{
  key: keyof TradeBacktestStats;
  label: string;
  format: (value: number | null) => string;
}> = [
  { key: "win_rate", label: "Win rate", format: (value) => `${value ?? 0}%` },
  { key: "expectancy_r", label: "Expectancy", format: (value) => `${value ?? 0}R` },
  {
    key: "profit_factor",
    label: "Profit factor",
    format: (value) => (value === null ? "—" : String(value)),
  },
  { key: "trades", label: "Trades", format: (value) => String(value ?? 0) },
  { key: "wins", label: "Wins", format: (value) => String(value ?? 0) },
  { key: "losses", label: "Losses", format: (value) => String(value ?? 0) },
];

function formatPrice(value: number): string {
  return value.toFixed(5);
}

function activateRowKey(event: KeyboardEvent): boolean {
  return event.key === "Enter" || event.key === " ";
}

const statRows: Array<{ key: keyof BacktestStats; label: string; suffix: string }> = [
  { key: "draw_hit_rate", label: "Draw hit rate", suffix: "%" },
  { key: "sweep_rate", label: "Sweep rate", suffix: "%" },
  { key: "displacement_rate", label: "Displacement rate", suffix: "%" },
  { key: "reversal_rate", label: "Reversal rate", suffix: "%" },
  { key: "inside_rate", label: "Inside-range rate", suffix: "%" },
  { key: "days", label: "Days analyzed", suffix: "" },
];

export function BacktestPageContent() {
  const router = useRouter();
  const { data: snapshot } = useObserverSnapshot(false);
  const { data, isLoading, error, run, params: cachedParams } = useBacktest();

  const pairs = useMemo(() => {
    const streamed = (snapshot?.pairs ?? []).map((p) => normalizePair(p.pair));
    return Array.from(new Set([...streamed, ...fallbackPairs])).sort();
  }, [snapshot?.pairs]);

  const [pair, setPair] = useState<string>("EUR/USD");
  const [strategy, setStrategy] = useState<BacktestStrategy>("draw_on_liquidity");
  const [side, setSide] = useState<BacktestSide>("all");
  const [start, setStart] = useState<string>(defaultStart);
  const [end, setEnd] = useState<string>(today);
  const [exportIntervals, setExportIntervals] = useState<ChartInterval[]>(["1h", "5m"]);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const presets = useMemo(() => rollingPresets(), []);
  const selected = STRATEGIES.find((item) => item.value === strategy) ?? STRATEGIES[0];

  useEffect(() => {
    if (!cachedParams) {
      return;
    }
    const restored = normalizePair(cachedParams.pair);
    setPair(restored || "EUR/USD");
    setStrategy(cachedParams.strategy);
    if (cachedParams.side) {
      setSide(cachedParams.side);
    }
    if (cachedParams.start) {
      setStart(cachedParams.start.slice(0, 10));
    }
    if (cachedParams.end) {
      setEnd(cachedParams.end.slice(0, 10));
    }
  }, [cachedParams]);

  const openSetup = (setup: BacktestSetup) => {
    saveBacktestSetup(setup);
    router.push(backtestSetupUrl(setup));
  };

  const openDay = (day: BacktestDay) => {
    if (!data) {
      return;
    }
    openSetup({ kind: "draw_on_liquidity", pair: data.pair, day });
  };

  const openTrade = (trade: BacktestTrade) => {
    if (!data || !isTradeBacktest(data)) {
      return;
    }
    openSetup({
      kind: "trade",
      pair: data.pair,
      strategy: data.strategy,
      trade,
    });
  };

  const onRun = () => {
    void run({
      pair,
      strategy,
      side,
      start: start ? new Date(`${start}T00:00:00.000Z`).toISOString() : undefined,
      end: end ? new Date(`${end}T23:59:59.999Z`).toISOString() : undefined,
    });
  };

  const exportResult = () => {
    if (!data || data.count === 0) {
      return;
    }
    downloadJsonFile(
      backtestExportFilename(data.strategy ?? strategy, data.pair, data.start, data.end),
      buildBacktestExportPayload(data, new Date().toISOString()),
    );
  };

  const toggleExportInterval = (interval: ChartInterval, checked: boolean) => {
    setExportIntervals((current) => {
      if (checked) {
        return CHART_INTERVAL_OPTIONS.filter(
          (option) => option === interval || current.includes(option),
        );
      }
      return current.filter((option) => option !== interval);
    });
  };

  const exportCandles = async () => {
    if (!pair || !start || !end || exportIntervals.length === 0) {
      return;
    }
    setExportLoading(true);
    setExportError(null);
    try {
      const response = await fetch("/api/analytics/candles/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pair,
          start: new Date(`${start}T00:00:00.000Z`).toISOString(),
          end: new Date(`${end}T23:59:59.999Z`).toISOString(),
          intervals: exportIntervals,
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        exported_at?: string;
        pair?: string;
        start?: string;
        end?: string;
        intervals?: string[];
        counts?: Record<string, number>;
        candles?: Record<string, unknown[]>;
      };
      if (!response.ok) {
        throw new Error(payload.error || "Failed to fetch candles");
      }
      downloadJsonFile(
        candlesExportFilename(pair, start, end, exportIntervals),
        payload,
      );
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Candle export failed");
    } finally {
      setExportLoading(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Backtest</h1>
        <p className="text-sm text-muted-foreground">{selected.blurb}</p>
      </header>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Parameters</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-6">
          <div className="space-y-1.5 sm:col-span-1">
            <label className="text-xs font-medium text-muted-foreground">Strategy</label>
            <Select
              value={strategy}
              onValueChange={(value) => setStrategy(value as BacktestStrategy)}
            >
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STRATEGIES.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-1">
            <label className="text-xs font-medium text-muted-foreground">Side</label>
            <Select
              value={side}
              onValueChange={(value) => setSide(value as BacktestSide)}
              disabled={strategy === "draw_on_liquidity"}
            >
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="bullish">Bullish</SelectItem>
                <SelectItem value="bearish">Bearish</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-1">
            <label className="text-xs font-medium text-muted-foreground">Pair</label>
            <Select value={pair} onValueChange={setPair}>
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pairs.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground">Date range</label>
            <DateRangePicker
              dateFrom={start}
              dateTo={end}
              presets={presets}
              onDateChange={(from, to) => {
                setStart(from ?? "");
                setEnd(to ?? "");
              }}
            />
          </div>
          <div className="flex items-end">
            <Button className="h-11 w-full" onClick={onRun} disabled={isLoading || !pair || !start || !end}>
              {isLoading ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" />
                  Running…
                </>
              ) : (
                "Run backtest"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Fetch &amp; export candles</CardTitle>
          <p className="text-xs text-muted-foreground">
            Uses the pair and date range from Parameters above. Closed OHLC only;
            fills history gaps the same way as backtests.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm">
            <span className="text-muted-foreground">Exporting </span>
            <span className="font-medium">{pair || "—"}</span>
            <span className="text-muted-foreground"> from </span>
            <span className="font-mono text-xs">{start || "—"}</span>
            <span className="text-muted-foreground"> to </span>
            <span className="font-mono text-xs">{end || "—"}</span>
          </p>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Timeframes</label>
            <div className="flex flex-wrap gap-3">
              {CHART_INTERVAL_OPTIONS.map((interval) => {
                const checked = exportIntervals.includes(interval);
                return (
                  <label
                    key={interval}
                    className="flex cursor-pointer items-center gap-2 text-sm"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(value) =>
                        toggleExportInterval(interval, value === true)
                      }
                    />
                    <span className="font-mono text-xs">{interval}</span>
                  </label>
                );
              })}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              className="h-11"
              onClick={() => void exportCandles()}
              disabled={
                exportLoading || !pair || !start || !end || exportIntervals.length === 0
              }
            >
              {exportLoading ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" />
                  Fetching…
                </>
              ) : (
                "Fetch & export JSON"
              )}
            </Button>
            <p className="text-xs text-muted-foreground">
              Change pair or dates in Parameters, then export again.
            </p>
          </div>
          {exportError ? (
            <p className="text-sm text-destructive">{exportError}</p>
          ) : null}
        </CardContent>
      </Card>

      {error ? (
        <Card>
          <CardContent className="py-6 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : null}

      {data && data.count === 0 ? (
        <Card>
          <CardContent className="space-y-2 py-6 text-sm text-muted-foreground">
            {isTradeBacktest(data) ? (
              <p>
                No {selected.label.toLowerCase()} setups in this range. The model
                needs a closed 1H level, a sweep or previous-day extreme, and a
                CISD on 5m before it will place a trade.
              </p>
            ) : (
              <>
                <p>
                  No completed trading days in this range to backtest. Today&apos;s
                  daily candle is still forming, and weekends are skipped.
                </p>
                <p>
                  To see the model&apos;s prediction for the current day, open a pair
                  and use the <span className="font-medium">Today&apos;s bias</span>{" "}
                  button.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      ) : null}

      {data && isTradeBacktest(data) && data.count > 0 ? (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Conclusions</CardTitle>
              <CardAction>
                <Button type="button" size="sm" variant="outline" className="h-8" onClick={exportResult}>
                  Export trades
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.conclusions.map((line, index) => (
                <p key={index} className="text-sm text-muted-foreground">
                  {line}
                </p>
              ))}
            </CardContent>
          </Card>

          <div className="grid gap-3 sm:grid-cols-3">
            {tradeStatRows.map((row) => (
              <Card key={row.key}>
                <CardContent className="py-4">
                  <p className="text-xs text-muted-foreground">{row.label}</p>
                  <p className="text-xl font-semibold">
                    {row.format(data.stats[row.key] as number | null)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Trades ({data.count})</CardTitle>
              <p className="text-xs text-muted-foreground">
                Click a row to open the setup on a chart.
              </p>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3">Time (UTC+3)</th>
                    <th className="py-2 pr-3">Side</th>
                    <th className="py-2 pr-3">Entry</th>
                    <th className="py-2 pr-3">Stop</th>
                    <th className="py-2 pr-3">Target</th>
                    <th className="py-2 pr-3">Result</th>
                    <th className="py-2 pr-3">R</th>
                  </tr>
                </thead>
                <tbody>
                  {[...data.trades].reverse().map((trade) => (
                    <tr
                      key={`${trade.time}-${trade.side}`}
                      className="border-b/50 cursor-pointer border-b hover:bg-muted/50"
                      tabIndex={0}
                      role="button"
                      aria-label={`Open ${trade.side} setup at ${formatKenyaCompactDateTime(trade.time)}`}
                      onClick={() => openTrade(trade)}
                      onKeyDown={(event) => {
                        if (activateRowKey(event)) {
                          event.preventDefault();
                          openTrade(trade);
                        }
                      }}
                    >
                      <td className="py-1.5 pr-3 font-mono text-xs">
                        {formatKenyaCompactDateTime(trade.time)}
                      </td>
                      <td className="py-1.5 pr-3 capitalize">{trade.side}</td>
                      <td className="py-1.5 pr-3 font-mono text-xs">
                        {formatPrice(trade.entry)}
                      </td>
                      <td className="py-1.5 pr-3 font-mono text-xs">
                        {formatPrice(trade.sl)}
                      </td>
                      <td className="py-1.5 pr-3 font-mono text-xs">
                        {formatPrice(trade.tp)}
                      </td>
                      <td className="py-1.5 pr-3 capitalize">{trade.result}</td>
                      <td className="py-1.5 pr-3">{trade.rr === null ? "—" : trade.rr}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      ) : null}

      {data && !isTradeBacktest(data) && data.count > 0 ? (
        <>
          <BacktestChart pair={data.pair} series={data.series} height={420} />

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Conclusions</CardTitle>
              <CardAction>
                <Button type="button" size="sm" variant="outline" className="h-8" onClick={exportResult}>
                  Export trades
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.conclusions.map((line, index) => (
                <p key={index} className="text-sm text-muted-foreground">
                  {line}
                </p>
              ))}
            </CardContent>
          </Card>

          <div className="grid gap-3 sm:grid-cols-3">
            {statRows.map((row) => (
              <Card key={row.key}>
                <CardContent className="py-4">
                  <p className="text-xs text-muted-foreground">{row.label}</p>
                  <p className="text-xl font-semibold">
                    {data.stats[row.key] as number}
                    {row.suffix}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Outcome breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {Object.entries(data.stats.outcome_counts).map(([outcome, count]) => (
                  <span
                    key={outcome}
                    className="rounded-full border border-border bg-card px-3 py-1 text-xs"
                  >
                    {outcomeLabel(outcome as never)}: {count}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Daily detail ({data.count})</CardTitle>
              <p className="text-xs text-muted-foreground">
                Click a row to open that day on a chart.
              </p>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3">Date</th>
                    <th className="py-2 pr-3">PDH</th>
                    <th className="py-2 pr-3">PDL</th>
                    <th className="py-2 pr-3">Close</th>
                    <th className="py-2 pr-3">Outcome</th>
                    <th className="py-2 pr-3">Bias→next</th>
                    <th className="py-2 pr-3">Draw hit</th>
                  </tr>
                </thead>
                <tbody>
                  {[...data.series].reverse().map((day) => (
                    <tr
                      key={day.date}
                      className="border-b/50 cursor-pointer border-b hover:bg-muted/50"
                      tabIndex={0}
                      role="button"
                      aria-label={`Open ${day.date.slice(0, 10)} setup`}
                      onClick={() => openDay(day)}
                      onKeyDown={(event) => {
                        if (activateRowKey(event)) {
                          event.preventDefault();
                          openDay(day);
                        }
                      }}
                    >
                      <td className="py-1.5 pr-3 font-mono text-xs">
                        {day.date.slice(0, 10)}
                      </td>
                      <td className="py-1.5 pr-3 font-mono text-xs">{day.pdh.toFixed(5)}</td>
                      <td className="py-1.5 pr-3 font-mono text-xs">{day.pdl.toFixed(5)}</td>
                      <td className="py-1.5 pr-3 font-mono text-xs">{day.close.toFixed(5)}</td>
                      <td className="py-1.5 pr-3">{outcomeLabel(day.outcome)}</td>
                      <td className="py-1.5 pr-3 capitalize">{day.bias}</td>
                      <td className="py-1.5 pr-3">
                        {day.draw_hit === null ? "—" : day.draw_hit ? "✓" : "✗"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
