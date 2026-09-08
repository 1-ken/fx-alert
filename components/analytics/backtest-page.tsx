"use client";

import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { subDays } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { BacktestChart } from "@/components/analytics/backtest-chart";
import { useObserverSnapshot } from "@/hooks/snapshot/use-snapshot";
import { useBacktest } from "@/hooks/analytics/use-backtest";
import {
  backtestSetupUrl,
  saveBacktestSetup,
  type BacktestSetup,
} from "@/lib/backtest-setup";
import { formatKenyaCompactDateTime } from "@/lib/datetime";
import { outcomeLabel } from "@/lib/draw-on-liquidity";
import {
  isTradeBacktest,
  type BacktestDay,
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
      "A closed 1H low or high is swept on the next hour's 5m chart, then an aggressive CISD is entered at 2.5R.",
  },
  {
    value: "pdhl_cisd",
    label: "PDH/PDL CISD",
    blurb:
      "Price takes the previous day's low or high, a 1H CISD prints, then the next hour continues on a 5m CISD at 2R.",
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
  const [start, setStart] = useState<string>(defaultStart);
  const [end, setEnd] = useState<string>(today);
  const presets = useMemo(() => rollingPresets(), []);
  const selected = STRATEGIES.find((item) => item.value === strategy) ?? STRATEGIES[0];

  useEffect(() => {
    if (!cachedParams) {
      return;
    }
    setPair(normalizePair(cachedParams.pair));
    setStrategy(cachedParams.strategy);
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
      start: start ? new Date(`${start}T00:00:00.000Z`).toISOString() : undefined,
      end: end ? new Date(`${end}T23:59:59.999Z`).toISOString() : undefined,
    });
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
        <CardContent className="grid gap-4 sm:grid-cols-5">
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
            <label className="text-xs font-medium text-muted-foreground">Pair</label>
            <Select value={pair} onValueChange={setPair}>
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pairs.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
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
