"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import {
  BellIcon,
  BellSlashIcon,
  FunnelIcon,
  SpeakerWaveIcon,
  SpeakerXMarkIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { useFvgStore } from "@/stores/fvg-store";
import { FVG_TIMEFRAMES, type FvgTimeframe } from "@/types/fvg";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export function FvgAlertsPanel() {
  const alerts = useFvgStore((state) => state.alerts);
  const filterSymbol = useFvgStore((state) => state.filterSymbol);
  const filterTimeframe = useFvgStore((state) => state.filterTimeframe);
  const soundEnabled = useFvgStore((state) => state.soundEnabled);
  const toastEnabled = useFvgStore((state) => state.toastEnabled);
  const fvgDetectorEnabled = useFvgStore((state) => state.fvgDetectorEnabled);

  const setFilterSymbol = useFvgStore((state) => state.setFilterSymbol);
  const setFilterTimeframe = useFvgStore((state) => state.setFilterTimeframe);
  const setSoundEnabled = useFvgStore((state) => state.setSoundEnabled);
  const setToastEnabled = useFvgStore((state) => state.setToastEnabled);
  const setFvgDetectorEnabled = useFvgStore((state) => state.setFvgDetectorEnabled);
  const clearAlerts = useFvgStore((state) => state.clearAlerts);
  const hydrateActiveZones = useFvgStore((state) => state.hydrateActiveZones);

  useEffect(() => {
    if (fvgDetectorEnabled) {
      void hydrateActiveZones();
    }
  }, [fvgDetectorEnabled, hydrateActiveZones]);

  const alertsList = useMemo(() => {
    const list = Object.values(alerts);
    list.sort((a, b) => b.bar_time - a.bar_time);

    return list.filter((item) => {
      if (filterSymbol && !item.symbol.toUpperCase().includes(filterSymbol.toUpperCase())) {
        return false;
      }
      if (filterTimeframe && item.timeframe !== filterTimeframe) {
        return false;
      }
      return true;
    });
  }, [alerts, filterSymbol, filterTimeframe]);

  const activeCount = useMemo(() => {
    return Object.values(alerts).filter((a) => a.status === "FORMED").length;
  }, [alerts]);

  return (
    <Card className="w-full shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div className="flex items-center gap-2">
          <CardTitle className="text-lg font-bold">Fair Value Gap (FVG) Detector</CardTitle>
          <Badge variant={activeCount > 0 ? "default" : "secondary"}>
            {activeCount} Active
          </Badge>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center space-x-2">
            <Switch
              id="fvg-enabled"
              checked={fvgDetectorEnabled}
              onCheckedChange={setFvgDetectorEnabled}
            />
            <Label htmlFor="fvg-enabled" className="text-xs text-muted-foreground">
              {fvgDetectorEnabled ? "Enabled" : "Disabled"}
            </Label>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSoundEnabled(!soundEnabled)}
            title={soundEnabled ? "Mute FVG sound alerts" : "Unmute FVG sound alerts"}
          >
            {soundEnabled ? (
              <SpeakerWaveIcon className="h-4 w-4 text-emerald-500" />
            ) : (
              <SpeakerXMarkIcon className="h-4 w-4 text-muted-foreground" />
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setToastEnabled(!toastEnabled)}
            title={toastEnabled ? "Disable toast notifications" : "Enable toast notifications"}
          >
            {toastEnabled ? (
              <BellIcon className="h-4 w-4 text-blue-500" />
            ) : (
              <BellSlashIcon className="h-4 w-4 text-muted-foreground" />
            )}
          </Button>
          {Object.keys(alerts).length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAlerts}
              title="Clear alerts list"
            >
              <TrashIcon className="h-4 w-4 text-muted-foreground hover:text-red-500" />
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Filter controls */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t">
          <div className="flex items-center gap-1.5 w-48">
            <FunnelIcon className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Filter pair..."
              value={filterSymbol ?? ""}
              onChange={(e) => setFilterSymbol(e.target.value || null)}
              className="h-8 text-xs"
            />
          </div>

          <div className="flex items-center gap-1 overflow-x-auto">
            <Button
              size="sm"
              variant={filterTimeframe === null ? "default" : "outline"}
              className="h-7 text-xs px-2.5"
              onClick={() => setFilterTimeframe(null)}
            >
              All TFs
            </Button>
            {FVG_TIMEFRAMES.map((tf) => (
              <Button
                key={tf}
                size="sm"
                variant={filterTimeframe === tf ? "default" : "outline"}
                className="h-7 text-xs px-2.5"
                onClick={() => setFilterTimeframe(filterTimeframe === tf ? null : tf)}
              >
                {tf}
              </Button>
            ))}
          </div>
        </div>

        {/* Alerts List */}
        {!fvgDetectorEnabled ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            FVG Detector is disabled. Enable the switch above to resume live evaluation.
          </div>
        ) : alertsList.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No FVG alerts matching the current filters. Waiting for closed candle setups...
          </div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {alertsList.map((alert) => {
              const isBull = alert.direction === "BULLISH";
              const isMitigated = alert.status === "MITIGATED";
              const dateStr = new Date(alert.bar_time * 1000).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              });

              return (
                <div
                  key={alert.id}
                  className={`flex items-center justify-between p-3 rounded-lg border text-sm transition-colors ${
                    isMitigated
                      ? "opacity-60 bg-muted/30 border-muted"
                      : isBull
                      ? "bg-emerald-500/5 border-emerald-500/20"
                      : "bg-red-500/5 border-red-500/20"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Badge
                      variant="outline"
                      className={
                        isBull
                          ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-semibold"
                          : "border-red-500/30 text-red-600 dark:text-red-400 font-semibold"
                      }
                    >
                      {isBull ? "BULL" : "BEAR"}
                    </Badge>
                    <span className="font-bold text-foreground">{alert.symbol}</span>
                    <Badge variant="secondary" className="text-xs">
                      {alert.timeframe}
                    </Badge>
                    <span className="text-xs text-muted-foreground font-mono">
                      [{alert.bottom.toFixed(5)} – {alert.top.toFixed(5)}]
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">{dateStr}</span>
                    <Badge
                      variant={isMitigated ? "outline" : "default"}
                      className={
                        isMitigated
                          ? "text-xs text-muted-foreground"
                          : isBull
                          ? "bg-emerald-600 hover:bg-emerald-700 text-xs"
                          : "bg-red-600 hover:bg-red-700 text-xs"
                      }
                    >
                      {alert.status}
                    </Badge>
                    <Link
                      href={`/instruments/${alert.symbol}`}
                      className="text-xs text-primary hover:underline font-medium"
                    >
                      View
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
