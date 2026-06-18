export type AlertCondition = "above" | "below" | "equal";
export type AlertStatus = "active" | "triggered" | "disabled";
export type AlertChannel = "email" | "sms" | "call" | "sound";
export type AlertType = "price" | "candle_close" | "prev_day_level";
export type CandleDirection = "above" | "below";
export type DrawLevelRef = "high" | "low" | "both";
export type DrawTrigger = "sweep" | "displacement" | "reversal" | "draw_met";

export interface Alert {
  id: string;
  pair: string;
  alert_type: AlertType;
  target_price: number | null;
  condition: AlertCondition | null;
  interval: string | null;
  direction: CandleDirection | null;
  threshold: number | null;
  last_evaluated_candle_time: string | null;
  status: AlertStatus;
  channel: AlertChannel;
  channels?: AlertChannel[];
  email?: string;
  phone?: string;
  custom_message?: string;
  created_at: string;
  triggered_at: string | null;
  last_checked_price: number | null;
  level_ref?: DrawLevelRef | null;
  dol_trigger?: DrawTrigger | null;
  batch_id?: string | null;
}

export interface AlertsResponse {
  total: number;
  active: Alert[];
  triggered: Alert[];
  all: Alert[];
}

export interface AlertUpsertInput {
  alert_type: AlertType;
  pair: string;
  target_price?: number;
  condition?: AlertCondition;
  interval?: string;
  direction?: CandleDirection;
  threshold?: number;
  channel?: AlertChannel;
  channels?: AlertChannel[];
  email?: string;
  phone?: string;
  custom_message?: string;
  // prev_day_level (draw on liquidity)
  level_ref?: DrawLevelRef;
  dol_trigger?: DrawTrigger;
  pairs?: string[];
}

export interface AlertUpsertResponse {
  success: boolean;
  alert: Alert;
  alerts?: Alert[];
}

export interface AlertDeleteResponse {
  success: boolean;
  message: string;
}
