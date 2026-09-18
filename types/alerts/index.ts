export type AlertCondition = "above" | "below" | "equal";
export type AlertStatus = "active" | "triggered" | "disabled" | "expired";
export type AlertChannel = "email" | "sms" | "call" | "sound";
export type AlertType = "price" | "candle_close" | "prev_day_level" | "market_structure";
export type StructureEventFilter = "bos" | "choch" | "sweep" | "any";
export type StructureDirectionFilter = "bull" | "bear" | "any";
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
  expires_at?: string | null;
  last_checked_price: number | null;
  level_ref?: DrawLevelRef | null;
  dol_trigger?: DrawTrigger | null;
  batch_id?: string | null;
  structure_event?: StructureEventFilter | null;
  structure_direction?: StructureDirectionFilter | null;
  min_swing_atr?: number | null;
  break_k?: number | null;
}

export interface AlertsResponse {
  total: number;
  active: Alert[];
  triggered: Alert[];
  expired: Alert[];
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
  expires_at: string;
  // prev_day_level (draw on liquidity)
  level_ref?: DrawLevelRef;
  dol_trigger?: DrawTrigger;
  pairs?: string[];
  structure_event?: StructureEventFilter;
  structure_direction?: StructureDirectionFilter;
  min_swing_atr?: number;
  break_k?: number;
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
