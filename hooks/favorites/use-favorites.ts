import useSWR from "swr";
import { useCallback, useMemo } from "react";
import { toast } from "sonner";
import { API_ENDPOINTS } from "@/lib/constants";
import { fetcher, getSwrLoadState, SWR_LIST_OPTIONS } from "@/lib/swr-config";

function normalizeFavorites(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const record = payload as Record<string, unknown>;
  if (!Array.isArray(record.pairs)) {
    return [];
  }

  return record.pairs.filter((pair): pair is string => typeof pair === "string");
}

function normalizePairKey(pair: string): string {
  return pair.replace(/[^a-z0-9]/gi, "").toUpperCase();
}

function addPairToCache(cache: unknown, pair: string): { pairs: string[] } {
  const current = normalizeFavorites(cache);
  const key = normalizePairKey(pair);
  if (current.some((item) => normalizePairKey(item) === key)) {
    return { pairs: current };
  }
  return { pairs: [...current, pair] };
}

function removePairFromCache(cache: unknown, pair: string): { pairs: string[] } {
  const current = normalizeFavorites(cache);
  const key = normalizePairKey(pair);
  return {
    pairs: current.filter((item) => normalizePairKey(item) !== key),
  };
}

/**
 * Loads and mutates the authenticated user's favorite instrument pairs.
 */
export function useFavorites() {
  const swr = useSWR<unknown>(
    API_ENDPOINTS.OBSERVER_PROXY.FAVORITES,
    fetcher,
    SWR_LIST_OPTIONS,
  );

  const { data, error, isLoading, isValidating, mutate } = swr;
  const { isInitialLoading, isRefreshing } = getSwrLoadState({
    data,
    error,
    isLoading,
    isValidating,
  });

  const favorites = normalizeFavorites(data);
  const favoriteSet = useMemo(
    () => new Set(favorites.map((pair) => normalizePairKey(pair))),
    [favorites],
  );
  const hasFetched = data !== undefined;

  const addFavorite = useCallback(
    async (pair: string) => {
      const optimistic = hasFetched
        ? addPairToCache(data, pair)
        : { pairs: [pair] };

      await mutate(optimistic, { revalidate: false });

      try {
        const response = await fetch(API_ENDPOINTS.OBSERVER_PROXY.FAVORITES, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pair }),
        });

        if (!response.ok) {
          throw new Error("Failed to add favorite");
        }

        await mutate();
        toast.success("Added to favorites");
      } catch (addError) {
        await mutate();
        throw addError;
      }
    },
    [data, hasFetched, mutate],
  );

  const removeFavorite = useCallback(
    async (pair: string) => {
      const optimistic = hasFetched ? removePairFromCache(data, pair) : { pairs: [] };

      await mutate(optimistic, { revalidate: false });

      try {
        const compact = encodeURIComponent(normalizePairKey(pair));
        const response = await fetch(`${API_ENDPOINTS.OBSERVER_PROXY.FAVORITES}/${compact}`, {
          method: "DELETE",
        });

        if (!response.ok) {
          throw new Error("Failed to remove favorite");
        }

        await mutate();
        toast.success("Removed from favorites");
      } catch (removeError) {
        await mutate();
        throw removeError;
      }
    },
    [data, hasFetched, mutate],
  );

  const toggleFavorite = useCallback(
    async (pair: string) => {
      const key = normalizePairKey(pair);
      if (favoriteSet.has(key)) {
        await removeFavorite(pair);
      } else {
        await addFavorite(pair);
      }
    },
    [addFavorite, favoriteSet, removeFavorite],
  );

  const isFavorite = useCallback(
    (pair: string) => favoriteSet.has(normalizePairKey(pair)),
    [favoriteSet],
  );

  return {
    favorites,
    isLoading: isInitialLoading,
    isInitialLoading,
    isRefreshing,
    error,
    addFavorite,
    removeFavorite,
    toggleFavorite,
    isFavorite,
  };
}
