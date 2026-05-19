export interface HistoricalPriceItem {
  pair: string;
  price: number;
  observed_at: string;
}

export interface HistoricalPricesResponse {
  count: number;
  items: HistoricalPriceItem[];
}

export interface OhlcCandle {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  is_forming?: boolean;
  expected_open?: string;
  expected_close?: string;
}

export interface OhlcResponse {
  pair: string;
  interval: string;
  start: string | null;
  end: string | null;
  count: number;
  candles: OhlcCandle[];
}

export interface OhlcWithFormingResponse extends OhlcResponse {
  forming_candle: OhlcCandle | null;
}

export interface StreamMetricItem {
  observed_at: string;
  ws_subscriber_count: number;
  queue_subscriber_count: number;
  snapshot_failure_count: number;
  stream_status: string;
}

export interface StreamMetricsResponse {
  count: number;
  items: StreamMetricItem[];
}

export interface ServiceHealthResponse {
  status?: string;
  [key: string]: unknown;
}
