"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useHistoricalPrices } from "@/hooks/historical/use-historical";

export default function HistoryPage() {
  const [pair, setPair] = useState("EURUSD");
  const { data, isLoading, error } = useHistoricalPrices({ pair, limit: 50 });

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
      <h1 className="text-xl font-semibold">Price history</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Query</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="pair">Pair</Label>
          <Input id="pair" value={pair} onChange={(e) => setPair(e.target.value.toUpperCase())} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Results ({data?.count ?? 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
          {error && <p className="text-sm text-destructive">Failed to load history.</p>}
          <ul className="max-h-96 space-y-1 overflow-y-auto text-sm">
            {(data?.items ?? []).map((item) => (
              <li key={`${item.pair}-${item.observed_at}`} className="flex justify-between border-b py-1">
                <span>{item.pair}</span>
                <span>{item.price}</span>
                <span className="text-muted-foreground">
                  {new Date(item.observed_at).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
