"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useSession } from "next-auth/react";
import useSWR from "swr";
import {
  authFetcher,
  getSwrLoadState,
  SWR_BOOTSTRAP_OPTIONS,
} from "@/lib/swr-config";
import type { BootstrapData } from "@/lib/api/bootstrap";

const BOOTSTRAP_CACHE_KEY_PREFIX = "fx-alert:bootstrap:";

interface BootstrapContextType {
  bootstrap: BootstrapData | null;
  isLoading: boolean;
  isInitialLoading: boolean;
  isRefreshing: boolean;
  isBootstrapBlocking: boolean;
  /** True while `bootstrap` comes from the local cache and no live response has arrived yet. */
  isBootstrapStale: boolean;
  error: Error | null;
  refetch: () => Promise<BootstrapData | undefined>;
}

const BootstrapContext = createContext<BootstrapContextType | undefined>(undefined);

const cacheListeners = new Set<() => void>();

function subscribeCache(listener: () => void): () => void {
  cacheListeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    cacheListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function readCachedBootstrapRaw(userId: string | undefined): string | null {
  if (!userId) return null;
  try {
    return window.localStorage.getItem(`${BOOTSTRAP_CACHE_KEY_PREFIX}${userId}`);
  } catch {
    return null;
  }
}

function parseCachedBootstrap(raw: string | null): BootstrapData | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as BootstrapData;
  } catch {
    return null;
  }
}

function writeCachedBootstrap(userId: string, data: BootstrapData): void {
  try {
    window.localStorage.setItem(`${BOOTSTRAP_CACHE_KEY_PREFIX}${userId}`, JSON.stringify(data));
  } catch {
    // Storage full or unavailable; the live response is still used.
    return;
  }
  for (const listener of cacheListeners) listener();
}

/**
 * Provides user bootstrap data (onboarding, subscription/trial, WS URL) via SWR.
 * The last response is cached per user so returning visits render immediately while
 * the live request revalidates in the background.
 */
export function BootstrapProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const userId = session?.user?.id;
  const accessToken = (session as { accessToken?: string } | null)?.accessToken;
  const accessTokenRef = useRef(accessToken);
  useEffect(() => {
    accessTokenRef.current = accessToken;
  }, [accessToken]);

  const cachedRaw = useSyncExternalStore(
    subscribeCache,
    () => readCachedBootstrapRaw(userId),
    () => null,
  );
  const cachedForUser = useMemo(() => parseCachedBootstrap(cachedRaw), [cachedRaw]);

  const swrKey =
    status === "unauthenticated" || !userId || !accessToken
      ? null
      : (["/api/bootstrap/me", userId] as const);

  const { data, error, isLoading, isValidating, mutate } = useSWR<BootstrapData>(
    swrKey,
    ([url]: readonly [string, string]) =>
      authFetcher<BootstrapData>([url, accessTokenRef.current ?? ""]),
    SWR_BOOTSTRAP_OPTIONS,
  );

  useEffect(() => {
    if (userId && data) {
      writeCachedBootstrap(userId, data);
    }
  }, [data, userId]);

  const bootstrap = data ?? cachedForUser;

  const { isInitialLoading: isLiveInitialLoading, isRefreshing } = getSwrLoadState({
    data,
    error,
    isLoading,
    isValidating,
  });
  const isInitialLoading = isLiveInitialLoading && !cachedForUser;

  const normalizedError =
    error instanceof Error ? error : error ? new Error(String(error)) : null;

  const isBootstrapBlocking =
    status === "authenticated" &&
    bootstrap === null &&
    normalizedError === null &&
    isInitialLoading;

  const isBootstrapStale = data === undefined && cachedForUser !== null && normalizedError === null;

  const refetch = React.useCallback(async () => {
    const result = await mutate();
    return result ?? undefined;
  }, [mutate]);

  return (
    <BootstrapContext.Provider
      value={{
        bootstrap,
        isLoading: isInitialLoading,
        isInitialLoading,
        isRefreshing,
        isBootstrapBlocking,
        isBootstrapStale,
        error: normalizedError,
        refetch,
      }}
    >
      {children}
    </BootstrapContext.Provider>
  );
}

export function useBootstrap() {
  const context = useContext(BootstrapContext);
  if (!context) {
    throw new Error("useBootstrap must be used within BootstrapProvider");
  }
  return context;
}
