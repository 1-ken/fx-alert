import type { SWRConfiguration } from "swr";

/**
 * Default JSON fetcher for observer proxy routes.
 */
export async function fetcher<T>(url: string): Promise<T> {
  const response = await fetch(url);

  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || "Request failed");
  }

  return response.json() as Promise<T>;
}

/**
 * Fetcher for authenticated bootstrap routes.
 */
export async function authFetcher<T>([url, token]: [string, string]): Promise<T> {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || "Request failed");
  }

  return response.json() as Promise<T>;
}

export const SWR_DEFAULT_OPTIONS: SWRConfiguration = {
  revalidateOnFocus: false,
  revalidateOnReconnect: true,
  dedupingInterval: 5_000,
  errorRetryCount: 2,
};

export const SWR_STATIC_OPTIONS: SWRConfiguration = {
  ...SWR_DEFAULT_OPTIONS,
  dedupingInterval: 300_000,
  revalidateIfStale: false,
};

export const SWR_LIST_OPTIONS: SWRConfiguration = {
  ...SWR_DEFAULT_OPTIONS,
  revalidateIfStale: false,
};

export const SWR_HISTORICAL_OPTIONS: SWRConfiguration = {
  ...SWR_DEFAULT_OPTIONS,
  keepPreviousData: true,
  dedupingInterval: 30_000,
};

export const SWR_HISTORICAL_FORMING_OPTIONS: SWRConfiguration = {
  ...SWR_HISTORICAL_OPTIONS,
  refreshInterval: 10_000,
};

export const SWR_HISTORICAL_FORMING_MOBILE_OPTIONS: SWRConfiguration = {
  ...SWR_HISTORICAL_FORMING_OPTIONS,
  refreshInterval: 15_000,
};

/** Closed OHLC for charts: HTTP history with periodic revalidation on bar close. */
export const SWR_HISTORICAL_CHART_CLOSED_OPTIONS: SWRConfiguration = {
  ...SWR_HISTORICAL_OPTIONS,
  refreshInterval: 30_000,
};

interface SwrLoadStateInput {
  data: unknown;
  error: unknown;
  isLoading: boolean;
  isValidating: boolean;
}

/**
 * Distinguishes first-load spinners from background revalidation.
 */
export function getSwrLoadState({
  data,
  error,
  isLoading,
  isValidating,
}: SwrLoadStateInput) {
  return {
    isInitialLoading: data === undefined && error === undefined && isLoading,
    isRefreshing: isValidating && data !== undefined,
  };
}
