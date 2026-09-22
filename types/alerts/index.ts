export type AlertCondition = "above" | "below" | "equal";
export type AlertStatus = "active" | "waiting" | "triggered" | "disabled" | "expired";
export type AlertChannel = "email" | "sms" | "call" | "sound";
export type AlertType = "price" | "candle_close" | "prev_day_level" | "market_structure";
export type StructureEventKind = "bos" | "choch" | "sweep";
/** @deprecated Prefer StructureEventKind[]; "any" only appears on legacy data before normalize. */
export type StructureEventFilter = StructureEventKind | "any";
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
  dol_trigger?: DrawTrigger[] | null;
  batch_id?: string | null;
  structure_event?: StructureEventKind[] | null;
  structure_direction?: StructureDirectionFilter | null;
  min_swing_atr?: number | null;
  break_k?: number | null;
  depends_on_alert_id?: string | null;
  chain_id?: string | null;
  sequence_index?: number | null;
}

export interface AlertsResponse {
  total: number;
  active: Alert[];
  waiting: Alert[];
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
  dol_trigger?: DrawTrigger[];
  pairs?: string[];
  structure_event?: StructureEventKind[];
  structure_direction?: StructureDirectionFilter;
  min_swing_atr?: number;
  break_k?: number;
  depends_on_alert_id?: string;
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

const DRAW_TRIGGERS: DrawTrigger[] = ["sweep", "displacement", "reversal", "draw_met"];
const STRUCTURE_EVENTS: StructureEventKind[] = ["bos", "choch", "sweep"];

export function normalizeDrawTriggers(value: unknown): DrawTrigger[] | null {
  const items = Array.isArray(value) ? value : value != null && value !== "" ? [value] : [];
  const out: DrawTrigger[] = [];
  for (const item of items) {
    if (typeof item !== "string") continue;
    const v = item.toLowerCase() as DrawTrigger;
    if (DRAW_TRIGGERS.includes(v) && !out.includes(v)) out.push(v);
  }
  return out.length > 0 ? out : null;
}

export function normalizeStructureEvents(value: unknown): StructureEventKind[] | null {
  const items = Array.isArray(value) ? value : value != null && value !== "" ? [value] : [];
  if (items.length === 1 && typeof items[0] === "string" && items[0].toLowerCase() === "any") {
    return [...STRUCTURE_EVENTS];
  }
  const out: StructureEventKind[] = [];
  for (const item of items) {
    if (typeof item !== "string") continue;
    const v = item.toLowerCase() as StructureEventKind;
    if (STRUCTURE_EVENTS.includes(v) && !out.includes(v)) out.push(v);
  }
  return out.length > 0 ? out : null;
}

export function formatEventList(events: string[] | null | undefined, fallback = "—"): string {
  if (!events || events.length === 0) return fallback;
  return events.join(", ");
}
