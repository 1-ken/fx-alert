import { Session } from "next-auth";

export interface MarketPair {
  pair: string;
  price: string;
  change: string;
  common_name?: string;
  source: string;
}

export interface SnapshotResponse {
  market_status: "open" | "closed";
  pairs: {
    currencies: MarketPair[];
    commodities: MarketPair[];
  };
  ts: string;
}

export interface StreamHealth {
  last_snapshot_age_seconds: number;
  subscriber_count: number;
  failure_count?: number;
  consecutive_failures?: number;
}

/**
 * Fetch current market snapshot
 * Returns live forex pairs and commodity data
 */
export async function getSnapshot(session: Session | null): Promise<SnapshotResponse | null> {
  if (!session?.user?.id) {
    return null;
  }

  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const response = await fetch(`${apiUrl}/snapshot`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.accessToken ?? ""}`,
      },
    });

    if (!response.ok) {
      console.error("Snapshot fetch failed:", response.status);
      return null;
    }

    const data = await response.json();
    return data as SnapshotResponse;
  } catch (error) {
    console.error("Error fetching snapshot:", error);
    return null;
  }
}

/**
 * Fetch stream health metrics
 * Shows how fresh the data is and connection status
 */
export async function getStreamHealth(session: Session | null): Promise<StreamHealth | null> {
  if (!session?.user?.id) {
    return null;
  }

  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const response = await fetch(`${apiUrl}/stream-health`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.accessToken ?? ""}`,
      },
    });

    if (!response.ok) {
      console.error("Stream health fetch failed:", response.status);
      return null;
    }

    const data = await response.json();
    return data as StreamHealth;
  } catch (error) {
    console.error("Error fetching stream health:", error);
    return null;
  }
}

/**
 * Check if the market is currently open
 * Forex markets operate 24/5: Sunday 22:00 UTC to Friday 22:00 UTC
 */
export function isMarketOpen(snapshot: SnapshotResponse | null): boolean {
  return snapshot?.market_status === "open";
}

/**
 * Get all available pairs from snapshot (currencies + commodities)
 */
export function getAllPairs(snapshot: SnapshotResponse | null): MarketPair[] {
  if (!snapshot) return [];
  return [
    ...(snapshot.pairs.currencies || []),
    ...(snapshot.pairs.commodities || []),
  ];
}
