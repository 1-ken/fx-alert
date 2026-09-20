import { useCallback, useEffect, useState } from "react";
import { todayTradingDayKey } from "@/lib/prediction-scorecard";
import type { PredictionScorecard } from "@/types/analytics";

export const PREDICTION_CACHE_TTL_MS = 5 * 60 * 1000;

export interface PredictionScorecardParams {
  pairs: string[];
  force?: boolean;
}

interface PredictionScorecardState {
  data: PredictionScorecard | null;
  isLoading: boolean;
  error: string | null;
  lastFetchedAt: number | null;
}

interface ClientCacheEntry {
  cacheKey: string;
  fetchedAt: number;
  data: PredictionScorecard;
}

let clientCache: ClientCacheEntry | null = null;

function buildCacheKey(pairs: string[]): string {
  return `${todayTradingDayKey()}:${[...pairs].sort().join(",")}`;
}

function readFreshCache(cacheKey: string): ClientCacheEntry | null {
  if (!clientCache || clientCache.cacheKey !== cacheKey) {
    return null;
  }
  if (Date.now() - clientCache.fetchedAt >= PREDICTION_CACHE_TTL_MS) {
    return null;
  }
  return clientCache;
}

/**
 * Loads today's draw-on-liquidity prediction scorecard from the API.
 * Results are cached client-side for 5 minutes per pair set and trading day.
 */
export function usePredictionScorecard() {
  const [state, setState] = useState<PredictionScorecardState>({
    data: null,
    isLoading: false,
    error: null,
    lastFetchedAt: null,
  });
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const nextRefreshAt =
    state.lastFetchedAt != null
      ? state.lastFetchedAt + PREDICTION_CACHE_TTL_MS
      : null;
  const canRefresh =
    !state.isLoading &&
    (nextRefreshAt == null || now >= nextRefreshAt);

  const load = useCallback(async (params: PredictionScorecardParams) => {
    if (params.pairs.length === 0) {
      setState({
        data: null,
        isLoading: false,
        error: "No instruments on the dashboard stream.",
        lastFetchedAt: null,
      });
      return null;
    }

    const cacheKey = buildCacheKey(params.pairs);
    if (!params.force) {
      const cached = readFreshCache(cacheKey);
      if (cached) {
        setState({
          data: cached.data,
          isLoading: false,
          error: null,
          lastFetchedAt: cached.fetchedAt,
        });
        return cached.data;
      }
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const response = await fetch("/api/analytics/predictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pairs: params.pairs }),
      });

      const payload = await response.json();
      if (!response.ok) {
        const message =
          typeof payload?.error === "string"
            ? payload.error
            : "Failed to load predictions";
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: message,
        }));
        return null;
      }

      const result = payload as PredictionScorecard;
      const fetchedAt = Date.now();
      clientCache = { cacheKey, fetchedAt, data: result };
      setState({
        data: result,
        isLoading: false,
        error: null,
        lastFetchedAt: fetchedAt,
      });
      return result;
    } catch (error) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : "Failed to load predictions",
      }));
      return null;
    }
  }, []);

  return {
    ...state,
    load,
    canRefresh,
    nextRefreshAt,
  };
}
