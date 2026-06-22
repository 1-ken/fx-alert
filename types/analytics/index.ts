import type { BiasDirection, DailyOutcome, DrawTarget } from "@/lib/draw-on-liquidity";

export interface BacktestDay {
  date: string;
  pdh: number;
  pdl: number;
  open: number;
  high: number;
  low: number;
  close: number;
  outcome: DailyOutcome;
  draw: DrawTarget;
  bias: BiasDirection;
  swept_high: boolean;
  swept_low: boolean;
  displaced: boolean;
  draw_hit: boolean | null;
}

export interface BacktestStats {
  days: number;
  sweep_rate: number;
  displacement_rate: number;
  reversal_rate: number;
  inside_rate: number;
  draw_hit_rate: number;
  draw_evaluated_days: number;
  bullish_days: number;
  bearish_days: number;
  neutral_days: number;
  outcome_counts: Record<string, number>;
}

export interface BacktestResult {
  pair: string;
  count: number;
  series: BacktestDay[];
  stats: BacktestStats;
  conclusions: string[];
  start?: string | null;
  end?: string | null;
}

export type { PredictionRecord, PredictionScorecard, PredictionStatus, PredictionSummary } from "@/lib/prediction-scorecard";
