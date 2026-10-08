import { CHART_INTERVAL_OPTIONS, type ChartInterval } from "@/lib/chart-utils";
import type { Alert, AlertEvent } from "@/types/alerts";

/**
 * Build URLs for the pair detail page (chart + alerts).
 */
export function pairToInstrumentPath(pair: string): string {
  return encodeURIComponent(pair.replace(/[^a-z0-9]/gi, "").toUpperCase());
}

export function buildInstrumentPairUrl(pair: string, price?: number): string {
  const path = `/instruments/${pairToInstrumentPath(pair)}`;
  if (price === undefined || !Number.isFinite(price)) {
    return path;
  }
  return `${path}?${new URLSearchParams({ price: String(price) })}`;
}

export type TriggeredChartTarget = {
  pair: string;
  alertType?: string | null;
  interval?: string | null;
  intervals?: string[] | null;
  timeframe?: string | null;
  candleTime?: string | null;
  triggeredAt?: string | null;
  price?: number | null;
};

function isChartInterval(value: string | null | undefined): value is ChartInterval {
  return (
    typeof value === "string" &&
    (CHART_INTERVAL_OPTIONS as readonly string[]).includes(value)
  );
}

/** Candle interval that best shows the bar an alert fired on. */
export function resolveTriggerChartInterval(target: TriggeredChartTarget): ChartInterval {
  if (isChartInterval(target.timeframe)) {
    return target.timeframe;
  }
  if (isChartInterval(target.interval)) {
    return target.interval;
  }
  if (target.alertType === "structure_session") {
    const last = target.intervals?.at(-1);
    if (isChartInterval(last)) {
      return last;
    }
  }
  if (target.alertType === "sweep_confirm") {
    return "5m";
  }
  if (target.alertType === "prev_day_level") {
    return "1d";
  }
  return "5m";
}

export function triggeredChartTargetFromAlert(alert: Alert): TriggeredChartTarget | null {
  if (!alert.triggered_at) {
    return null;
  }
  return {
    pair: alert.pair,
    alertType: alert.alert_type,
    interval: alert.interval,
    intervals: alert.intervals,
    candleTime: alert.last_evaluated_candle_time,
    triggeredAt: alert.triggered_at,
    price: alert.last_checked_price,
  };
}

export function triggeredChartTargetFromEvent(event: AlertEvent): TriggeredChartTarget {
  const data = event.data;
  const eventPrice = Number.isFinite(event.price) ? event.price : null;
  return {
    pair: event.pair,
    alertType: event.alert_type,
    interval: data?.interval,
    intervals: data?.intervals,
    timeframe: event.timeframe,
    candleTime: data?.last_evaluated_candle_time,
    triggeredAt: event.triggered_at,
    price: eventPrice ?? data?.last_checked_price ?? null,
  };
}

/** Instrument chart focused on the candle and price that fired an alert. */
export function buildTriggeredChartUrl(target: TriggeredChartTarget): string {
  const params = new URLSearchParams();
  params.set("interval", resolveTriggerChartInterval(target));
  const at = target.candleTime || target.triggeredAt;
  if (at) {
    params.set("at", at);
  }
  if (typeof target.price === "number" && Number.isFinite(target.price)) {
    params.set("price", String(target.price));
  }
  return `/instruments/${pairToInstrumentPath(target.pair)}?${params.toString()}`;
}
