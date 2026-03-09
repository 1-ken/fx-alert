export type AlertCondition = "above" | "below" | "equal";
export type AlertStatus = "active" | "triggered" | "disabled";
export type AlertChannel = "email" | "sms" | "call";

export interface Alert {
  id: string;
  pair: string;
  target_price: number;
  condition: AlertCondition;
  status: AlertStatus;
  channel: AlertChannel;
  email?: string;
  phone?: string;
  custom_message?: string;
  created_at: string;
  triggered_at: string | null;
  last_checked_price: number;
}

export interface AlertsResponse {
  total: number;
  active: Alert[];
  triggered: Alert[];
  all: Alert[];
}

export interface AlertUpsertInput {
  pair: string;
  target_price: number;
  condition: AlertCondition;
  channel: AlertChannel;
  email?: string;
  phone?: string;
  custom_message?: string;
}

export interface AlertUpsertResponse {
  success: boolean;
  alert: Alert;
}

export interface AlertDeleteResponse {
  success: boolean;
  message: string;
}

export interface ForexPair {
  pair: string;
  bid: number;
  ask: number;
  spread: number;
}

export interface MarketSnapshot {
  market_status: "open" | "closed";
  pairs: ForexPair[];
  ts: string;
}

export interface StreamPayload extends MarketSnapshot {
  alerts?: {
    active: Alert[];
    triggered: Alert[];
  };
}

export interface StreamHealth {
  status: "healthy" | "degraded" | "stale";
  stream_interval_seconds: number;
  snapshot_timeout_seconds: number;
  max_snapshot_failures: number;
  consecutive_snapshot_failures: number;
  last_snapshot_ts: string;
  last_snapshot_age_seconds: number;
  subscriber_count: number;
}

export interface ClientConfig {
  wsUrl?: string;
}
