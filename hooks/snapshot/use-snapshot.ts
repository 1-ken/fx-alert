import useSWR from "swr";
import { useMemo } from "react";
import { API_ENDPOINTS } from "@/lib/constants";
import { fetcher } from "@/hooks/use-observer";
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

      const category =
        Array.isArray(pairsRecord?.commodities) && pairsRecord.commodities.includes(rawPair)
          ? "commodity"
          : "currency";

      return {
        pair: normalizePairSymbol(pair),
        price,
        ...(change !== null ? { change } : {}),
        ...(bid !== null ? { bid } : {}),
        ...(ask !== null ? { ask } : {}),
        ...(spread !== null ? { spread } : {}),
        ...(commonName ? { common_name: commonName } : {}),
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

export function useObserverSnapshot(enablePolling: boolean) {
  const swr = useSWR<unknown>(API_ENDPOINTS.OBSERVER_PROXY.SNAPSHOT, fetcher, {
    revalidateOnFocus: false,
    refreshInterval: enablePolling ? 5_000 : 0,
  });

  const normalizedData = useMemo(() => normalizeMarketSnapshot(swr.data), [swr.data]);

  return {
    ...swr,
    data: normalizedData,
  };
}
