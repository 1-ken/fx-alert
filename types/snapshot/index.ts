import type { Alert } from "@/types/alerts";

export interface ForexPair {
  pair: string;
  price: number;
  bid?: number;
  ask?: number;
  spread?: number;
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
