import type { Alert } from "@/types/alerts";
import type { OhlcCandle } from "@/types/historical";

export interface ForexPair {
  pair: string;
  price: number;
  change?: number;
  bid?: number;
  ask?: number;
  spread?: number;
  common_name?: string;
  category?: "currency" | "commodity" | "index";
  source?: string;
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

/** Chart-scoped observe WebSocket payload (`?pair=&interval=`). */
export interface ChartStreamPayload {
  market_status?: "open" | "closed";
  ts?: string;
  pairs:
    | ForexPair[]
    | {
        currencies?: ForexPair[];
        commodities?: ForexPair[];
      };
  stream?: {
    pair: string | null;
    interval: string;
    stream_key?: string;
  };
  forming_candle?: OhlcCandle | null;
  has_forming_candle?: boolean;
  chart_live_price?: number;
  alerts?: {
    active: Alert[];
    triggered: Alert[];
  };
}
