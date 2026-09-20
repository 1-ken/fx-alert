import { useMemo } from "react";
import {
  useHistoricalOhlc,
  useHistoricalOhlcWithForming,
} from "@/hooks/historical/use-historical";
import {
  computeBiasSeries,
  computeLiveBias,
  computeLiveBiasDetails,
  type DayBias,
  type LiveBias,
  type LiveBiasDetails,
} from "@/lib/draw-on-liquidity";
import { extractFormingCandle } from "@/lib/chart-utils";
import {
  normalizeClosedDailyCandles,
  normalizeFormingDailyCandle,
} from "@/lib/daily-trading-day";
import type { OhlcCandle } from "@/types/historical";

const DAILY_INTERVAL = "1d";

export interface DrawOnLiquidityResult {
  /** Current-day previous-day-high/low levels (null until loaded). */
  levels: { pdh: number; pdl: number } | null;
  /** Live bias/draw for the forming day, refined by live price. */
  live: LiveBias | null;
  /** Reference candles/outcome backing the live bias (for verification UI). */
  details: LiveBiasDetails | null;
  /** Per-day classified history (oldest -> newest). */
  biasSeries: DayBias[];
  /** Closed daily candles backing the model. */
  dailyCandles: OhlcCandle[];
  isLoading: boolean;
  /** True when the closed-history request failed. */
  isError: boolean;
  /** Re-fetch the closed + forming daily history. */
  refresh: () => void;
}

/**
 * Previous-day-high/low draw-on-liquidity model for a pair, combining closed
 * daily history with today's forming daily candle and the live price.
 */
export function useDrawOnLiquidity(
  pair: string,
  livePrice?: number,
  options?: { historyDays?: number },
): DrawOnLiquidityResult {
  const historyDays = options?.historyDays ?? 60;

  const {
    data: closedData,
    error: closedError,
    isInitialLoading: closedLoading,
    mutate: mutateClosed,
  } = useHistoricalOhlc(
    { pair, interval: DAILY_INTERVAL, limit: historyDays },
    { chartClosed: true },
  );

  const { data: formingData, mutate: mutateForming } =
    useHistoricalOhlcWithForming({
      pair,
      interval: DAILY_INTERVAL,
      limit: 2,
    });

  const dailyCandles = useMemo(
    () => normalizeClosedDailyCandles(closedData?.candles ?? []),
    [closedData],
  );

  const todayCandle = useMemo(() => {
    const forming = extractFormingCandle(formingData);
    return forming ? normalizeFormingDailyCandle(forming) : null;
  }, [formingData]);

  const biasSeries = useMemo(() => computeBiasSeries(dailyCandles), [dailyCandles]);

  const live = useMemo(
    () => computeLiveBias(dailyCandles, todayCandle, livePrice),
    [dailyCandles, todayCandle, livePrice],
  );

  const details = useMemo(
    () => computeLiveBiasDetails(dailyCandles, todayCandle),
    [dailyCandles, todayCandle],
  );

  const levels = useMemo(
    () => (live ? { pdh: live.pdh, pdl: live.pdl } : null),
    [live],
  );

  const isEnabled = pair !== "";
  // Loading whenever a request is in flight, or it is enabled but nothing has
  // resolved yet (no data and no error). This avoids briefly showing an empty
  // state before the fetch settles.
  const isLoading =
    isEnabled && !closedData && !closedError ? true : closedLoading;
  const isError = Boolean(closedError) && !closedData;

  const refresh = () => {
    void mutateClosed();
    void mutateForming();
  };

  return {
    levels,
    live,
    details,
    biasSeries,
    dailyCandles,
    isLoading,
    isError,
    refresh,
  };
}
