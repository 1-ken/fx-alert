"use client";

import React, { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import useSWR from "swr";
import {
  authFetcher,
  getSwrLoadState,
  SWR_STATIC_OPTIONS,
} from "@/lib/swr-config";
import type { BootstrapData } from "@/lib/api/bootstrap";

const BOOTSTRAP_CACHE_PREFIX = "fx-alert:bootstrap:";

function readBootstrapCache(userId: string): BootstrapData | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  try {
    const raw = window.sessionStorage.getItem(`${BOOTSTRAP_CACHE_PREFIX}${userId}`);
    if (!raw) {
      return undefined;
    }
    return JSON.parse(raw) as BootstrapData;
  } catch {
    return undefined;
  }
}

function writeBootstrapCache(userId: string, data: BootstrapData): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(`${BOOTSTRAP_CACHE_PREFIX}${userId}`, JSON.stringify(data));
  } catch {
    // Ignore quota or serialization errors.
  }
}

interface BootstrapContextType {
  bootstrap: BootstrapData | null;
  isLoading: boolean;
  isInitialLoading: boolean;
  isRefreshing: boolean;
  isBootstrapBlocking: boolean;
  error: Error | null;
  refetch: () => Promise<BootstrapData | undefined>;
}

const BootstrapContext = createContext<BootstrapContextType | undefined>(undefined);

const BOOTSTRAP_SWR_OPTIONS = {
  ...SWR_STATIC_OPTIONS,
  keepPreviousData: true,
};

/**
 * Provides cached user bootstrap data (onboarding state, WS URL) via SWR.
 */
export function BootstrapProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const userId = session?.user?.id;
  const accessToken = (session as { accessToken?: string } | null)?.accessToken;

  const fallbackData = useMemo(() => {
    if (!userId) {
      return undefined;
    }
    return readBootstrapCache(userId);
  }, [userId]);

  const swrKey =
    status === "unauthenticated" || !userId || !accessToken
      ? null
      : (["/api/bootstrap/me", accessToken] as const);

  const { data, error, isLoading, isValidating, mutate } = useSWR<BootstrapData>(
    swrKey,
    authFetcher,
    {
      ...BOOTSTRAP_SWR_OPTIONS,
      fallbackData,
    },
  );

  const { isInitialLoading, isRefreshing } = getSwrLoadState({
    data,
    error,
    isLoading,
    isValidating,
  });

  const normalizedError =
    error instanceof Error ? error : error ? new Error(String(error)) : null;

  const isBootstrapBlocking =
    status === "authenticated" &&
    data === undefined &&
    normalizedError === null &&
    isInitialLoading;

  useEffect(() => {
    if (data && userId) {
      writeBootstrapCache(userId, data);
    }
  }, [data, userId]);

  const refetch = React.useCallback(async () => {
    const result = await mutate();
    return result ?? undefined;
  }, [mutate]);

  return (
    <BootstrapContext.Provider
      value={{
        bootstrap: data ?? null,
        isLoading: isInitialLoading,
        isInitialLoading,
        isRefreshing,
        isBootstrapBlocking,
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
