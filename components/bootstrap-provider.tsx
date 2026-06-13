"use client";

import React, { createContext, useContext, useEffect, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import useSWR from "swr";
import {
  authFetcher,
  getSwrLoadState,
  SWR_BOOTSTRAP_OPTIONS,
} from "@/lib/swr-config";
import type { BootstrapData } from "@/lib/api/bootstrap";

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

/**
 * Provides user bootstrap data (onboarding, subscription/trial, WS URL) via SWR.
 * Revalidates frequently so manual DB changes to trial_started_at are picked up quickly.
 */
export function BootstrapProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const userId = session?.user?.id;
  const accessToken = (session as { accessToken?: string } | null)?.accessToken;

  const swrKey =
    status === "unauthenticated" || !userId || !accessToken
      ? null
      : (["/api/bootstrap/me", accessToken] as const);

  const { data, error, isLoading, isValidating, mutate } = useSWR<BootstrapData>(
    swrKey,
    authFetcher,
    SWR_BOOTSTRAP_OPTIONS,
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
    if (status !== "authenticated" || !accessToken) {
      return;
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void mutate();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [accessToken, mutate, status]);

  const refetch = React.useCallback(async () => {
    const result = await mutate(undefined, { revalidate: true });
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
