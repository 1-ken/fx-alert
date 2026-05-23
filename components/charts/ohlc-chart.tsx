"use client";

import { CandlestickChart, type CandlestickChartProps } from "@/components/charts/candlestick-chart";

/** @deprecated Use CandlestickChart — kept for dashboard import compatibility. */
export type OhlcChartProps = Omit<CandlestickChartProps, "showIntervalSelect" | "onIntervalChange"> & {
  interval?: CandlestickChartProps["interval"];
  onIntervalChange?: CandlestickChartProps["onIntervalChange"];
  showIntervalSelect?: boolean;
};

export function OhlcChart(props: OhlcChartProps) {
  return <CandlestickChart {...props} />;
}
