import type { ChartInterval } from "@/lib/chart-utils";

type BuildCreateAlertUrlParams = {
  pair: string;
  alertType: "price" | "candle_close";
  targetPrice?: number;
  threshold?: number;
  interval?: ChartInterval;
};

/**
 * Build /alerts URL with prefilled query params for create-alert form.
 */
export function buildCreateAlertUrl({
  pair,
  alertType,
  targetPrice,
  threshold,
  interval,
}: BuildCreateAlertUrlParams): string {
  const params = new URLSearchParams();
  params.set("pair", pair);
  params.set("alert_type", alertType);
  params.set("channel", "sound");
  if (alertType === "price" && typeof targetPrice === "number" && Number.isFinite(targetPrice)) {
    params.set("target_price", String(targetPrice));
  }
  if (alertType === "candle_close") {
    if (typeof threshold === "number" && Number.isFinite(threshold)) {
      params.set("threshold", String(threshold));
    }
    if (interval) {
      params.set("interval", interval);
    }
  }
  return `/alerts?${params.toString()}`;
}
