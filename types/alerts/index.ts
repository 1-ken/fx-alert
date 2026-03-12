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
