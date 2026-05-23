"use client";

import { useState } from "react";
import { CandlestickChart } from "@/components/charts/candlestick-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CHART_INTERVAL_OPTIONS, type ChartInterval } from "@/lib/chart-utils";

export default function HistoryPage() {
  const [pair, setPair] = useState("EURUSD");
  const [interval, setInterval] = useState<ChartInterval>("5m");
  const [limit, setLimit] = useState(200);

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-6">
      <h1 className="text-xl font-semibold">Candle history</h1>
      <p className="text-sm text-muted-foreground">
        OHLC candlesticks from archived market data. Pan and zoom on the chart.
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Query</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="pair">Pair</Label>
            <Input
              id="pair"
              value={pair}
              onChange={(e) => setPair(e.target.value.replace(/[^a-z0-9]/gi, "").toUpperCase())}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="interval">Interval</Label>
            <Select value={interval} onValueChange={(v) => setInterval(v as ChartInterval)}>
              <SelectTrigger id="interval">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHART_INTERVAL_OPTIONS.map((opt) => (
                  <SelectItem key={opt} value={opt}>
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="limit">Candles</Label>
            <Select
              value={String(limit)}
              onValueChange={(v) => setLimit(Number(v))}
            >
              <SelectTrigger id="limit">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[50, 100, 200, 500].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {pair ? (
        <CandlestickChart
          pair={pair}
          interval={interval}
          limit={limit}
          height={400}
          showForming
        />
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Enter a pair to load candle history.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
