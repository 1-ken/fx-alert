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

export type BacktestStrategy =
  | "draw_on_liquidity"
  | "liquidity_sweep"
  | "pdhl_cisd";

export interface BacktestResult {
  strategy?: "draw_on_liquidity";
  pair: string;
  count: number;
  series: BacktestDay[];
  stats: BacktestStats;
  conclusions: string[];
  start?: string | null;
  end?: string | null;
}

export interface BacktestOhlcBar {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface SweepPrevDay {
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
}

export type BacktestSide = "all" | "bullish" | "bearish";

export interface PdhlTakeBar extends BacktestOhlcBar {
  took: "pdh" | "pdl";
}

export interface SweepTradeContext {
  hour_utc: number;
  weekday: number;
  bars_into_hour: number;
  bars_held: number;
  duration_minutes: number;
  sweep_depth: number;
  cisd: BacktestOhlcBar;
  cisd_body: number;
  aggressive_ratio: number | null;
  mae_r: number;
  mfe_r: number;
  risk: number;
  planned_r: number;
  prev_day: SweepPrevDay;
  cisd_1h?: BacktestOhlcBar;
  take?: PdhlTakeBar;
  candles_1h: BacktestOhlcBar[];
  candles_5m?: BacktestOhlcBar[];
  candles_1h_prev_day?: BacktestOhlcBar[];
  candles_5m_prev_day?: BacktestOhlcBar[];
}

export interface SweepStrategyRules {
  reward_r: number;
  entry: string;
  stop: string;
  sweep_window: string;
  aggressive_body_mult: number;
  aggressive_lookback: number;
  side_filter?: BacktestSide;
}

export interface PdhlStrategyRules {
  strict_trade_through: boolean;
  side_filter: BacktestSide;
  sequence: string;
  reward_r: number;
}

export interface BacktestTrade {
  time: string;
  side: "bullish" | "bearish";
  entry: number;
  sl: number;
  tp: number;
  exit_time: string | null;
  result: "win" | "loss" | "open" | "gap";
  rr: number | null;
  sweep_level: number;
  sweep_time?: string | null;
  context?: SweepTradeContext;
}

export interface TradeBacktestStats {
  trades: number;
  wins: number;
  losses: number;
  open: number;
  gaps?: number;
  win_rate: number;
  avg_r: number;
  expectancy_r: number;
  profit_factor: number | null;
  bullish: number;
  bearish: number;
}

export interface TradeBacktestResult {
  strategy: "liquidity_sweep" | "pdhl_cisd";
  pair: string;
  count: number;
  trades: BacktestTrade[];
  stats: TradeBacktestStats;
  conclusions: string[];
  start?: string | null;
  end?: string | null;
  side_filter?: BacktestSide | null;
  rules?: SweepStrategyRules | PdhlStrategyRules;
}

export type AnyBacktestResult = BacktestResult | TradeBacktestResult;

export function isTradeBacktest(
  result: AnyBacktestResult,
): result is TradeBacktestResult {
  return result.strategy === "liquidity_sweep" || result.strategy === "pdhl_cisd";
}

export type { PredictionRecord, PredictionScorecard, PredictionStatus, PredictionSummary } from "@/lib/prediction-scorecard";
