import useSWR from "swr";
import { useMemo } from "react";
import { API_ENDPOINTS } from "@/lib/constants";
import { fetcher, getSwrLoadState, SWR_LIST_OPTIONS } from "@/lib/swr-config";
import type { MarketSnapshot } from "@/types/snapshot";

export function normalizePairSymbol(pair: string): string {
  const compactPair = pair.replace(/[^a-z]/gi, "").toUpperCase();

  if (compactPair.length === 6) {
    return `${compactPair.slice(0, 3)}/${compactPair.slice(3)}`;
  }

  return pair.trim().toUpperCase();
}

export function parseNumericValue(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, "").trim());
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export function normalizeMarketSnapshot(payload: unknown): MarketSnapshot | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const pairsRecord =
    record.pairs && typeof record.pairs === "object"
      ? (record.pairs as Record<string, unknown>)
      : null;

  const rawPairs = Array.isArray(record.pairs)
    ? record.pairs
    : [
        ...(Array.isArray(pairsRecord?.currencies) ? pairsRecord.currencies : []),
        ...(Array.isArray(pairsRecord?.commodities) ? pairsRecord.commodities : []),
        ...(Array.isArray(pairsRecord?.indices) ? pairsRecord.indices : []),
      ];

  const pairs = rawPairs
    .map<MarketSnapshot["pairs"][number] | null>((rawPair) => {
      if (!rawPair || typeof rawPair !== "object") {
        return null;
      }

      const pairRecord = rawPair as Record<string, unknown>;
      const pair = typeof pairRecord.pair === "string" ? pairRecord.pair : null;

      if (!pair) {
        return null;
      }

      const source =
        typeof pairRecord.source === "string" ? pairRecord.source.toLowerCase() : undefined;

      const bid = parseNumericValue(pairRecord.bid);
      const ask = parseNumericValue(pairRecord.ask);
      const spread = parseNumericValue(pairRecord.spread);
      const change = parseNumericValue(pairRecord.change);
      const price = parseNumericValue(pairRecord.price) ?? bid ?? ask ?? null;
      const commonName =
        typeof pairRecord.common_name === "string" && pairRecord.common_name.trim().length > 0
          ? pairRecord.common_name.trim()
          : undefined;

      if (price === null) {
        return null;
      }

      let category: MarketSnapshot["pairs"][number]["category"] = "currency";
      if (
        source === "usd-index" ||
        source === "dxy" ||
        pair.toUpperCase().includes("DXY")
      ) {
        category = "index";
      } else if (
        source === "commodities" ||
        source === "bonds" ||
        (Array.isArray(pairsRecord?.commodities) && pairsRecord.commodities.includes(rawPair))
      ) {
        category = "commodity";
      }

      return {
        pair: normalizePairSymbol(pair),
        price,
        ...(change !== null ? { change } : {}),
        ...(bid !== null ? { bid } : {}),
        ...(ask !== null ? { ask } : {}),
        ...(spread !== null ? { spread } : {}),
        ...(commonName ? { common_name: commonName } : {}),
        ...(source ? { source } : {}),
        category,
      };
    })
    .filter((pair): pair is MarketSnapshot["pairs"][number] => pair !== null);

  const marketStatus = record.market_status === "open" ? "open" : "closed";
  const ts = typeof record.ts === "string" ? record.ts : new Date().toISOString();

  return {
    market_status: marketStatus,
    pairs,
    ts,
  };
}

/**
 * Market snapshot with optional polling fallback when WebSocket is offline.
 */
export function useObserverSnapshot(enablePolling: boolean) {
  const swr = useSWR<unknown>(API_ENDPOINTS.OBSERVER_PROXY.SNAPSHOT, fetcher, {
    ...SWR_LIST_OPTIONS,
    refreshInterval: enablePolling ? 5_000 : 0,
  });

  const normalizedData = useMemo(() => normalizeMarketSnapshot(swr.data), [swr.data]);
  const { isInitialLoading, isRefreshing } = getSwrLoadState(swr);

  return {
    ...swr,
    data: normalizedData,
    isInitialLoading,
    isRefreshing,
    isLoading: isInitialLoading,
  };
}
