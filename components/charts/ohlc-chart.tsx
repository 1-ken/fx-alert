"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useHistoricalOhlcWithForming } from "@/hooks/historical/use-historical";
import type { OhlcCandle } from "@/types/historical";

interface OhlcChartProps {
  pair: string;
  interval?: string;
}

function formatPrice(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return value >= 100 ? value.toFixed(2) : value.toFixed(4);
}

function CandleRow({ candle }: { candle: OhlcCandle }) {
  const bullish = candle.close >= candle.open;
  return (
    <div className="grid grid-cols-6 gap-2 border-b py-1.5 text-xs last:border-0">
      <span className="col-span-2 truncate text-muted-foreground">
        {new Date(candle.timestamp).toLocaleString()}
      </span>
      <span>O {formatPrice(candle.open)}</span>
      <span>H {formatPrice(candle.high)}</span>
      <span>L {formatPrice(candle.low)}</span>
      <span className={bullish ? "text-green-600" : "text-red-600"}>
        C {formatPrice(candle.close)}
      </span>
    </div>
  );
}

export function OhlcChart({ pair, interval = "5m" }: OhlcChartProps) {
  const { data, isLoading, error } = useHistoricalOhlcWithForming({
    pair,
    interval,
    limit: 24,
  });

  const candles = data?.candles ?? [];
  const forming = data?.forming_candle ?? null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          {pair} · {interval} candles
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && <Skeleton className="h-40 w-full" />}
        {error && (
          <p className="text-sm text-destructive">Could not load chart data.</p>
        )}
        {!isLoading && !error && candles.length === 0 && !forming && (
          <p className="text-sm text-muted-foreground">No candle data yet.</p>
        )}
        {!isLoading && !error && (candles.length > 0 || forming) && (
          <div className="max-h-64 overflow-y-auto">
            {forming && (
              <p className="mb-2 text-xs font-medium text-muted-foreground">Forming</p>
            )}
            {forming && <CandleRow candle={forming} />}
            {[...candles].reverse().map((candle) => (
              <CandleRow key={candle.timestamp} candle={candle} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
