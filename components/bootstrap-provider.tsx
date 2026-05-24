"use client";

import React, { createContext, useContext, ReactNode } from "react";
import { useSession } from "next-auth/react";
import useSWR from "swr";
import {
  authFetcher,
  getSwrLoadState,
  SWR_STATIC_OPTIONS,
} from "@/lib/swr-config";
import type { BootstrapData } from "@/lib/api/bootstrap";

interface BootstrapContextType {
  bootstrap: BootstrapData | null;
  isLoading: boolean;
  isInitialLoading: boolean;
  isRefreshing: boolean;
  error: Error | null;
  refetch: () => Promise<BootstrapData | undefined>;
}

const BootstrapContext = createContext<BootstrapContextType | undefined>(undefined);

/**
 * Provides cached user bootstrap data (onboarding state, WS URL) via SWR.
 */
export function BootstrapProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const accessToken = (session as { accessToken?: string } | null)?.accessToken;

  const swrKey =
    userId && accessToken ? (["/api/bootstrap/me", accessToken] as const) : null;

  const { data, error, isLoading, isValidating, mutate } = useSWR<BootstrapData>(
    swrKey,
    authFetcher,
    SWR_STATIC_OPTIONS,
  );

  const { isInitialLoading, isRefreshing } = getSwrLoadState({
    data,
    error,
    isLoading,
    isValidating,
  });

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
        error: error instanceof Error ? error : error ? new Error(String(error)) : null,
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
