"use client";

import React, { createContext, useContext, ReactNode, useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { getMe, BootstrapData } from "@/lib/api/bootstrap";

interface BootstrapContextType {
  bootstrap: BootstrapData | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

const BootstrapContext = createContext<BootstrapContextType | undefined>(undefined);

export function BootstrapProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const [bootstrap, setBootstrap] = useState<BootstrapData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchBootstrap = React.useCallback(async () => {
    if (!session?.user?.id) {
      console.log("[Bootstrap] No session found, skipping bootstrap fetch");
      setBootstrap(null);
      setIsLoading(false);
      return;
    }

    console.log("[Bootstrap] Fetching bootstrap data for user:", session.user.id);
    setIsLoading(true);
    setError(null);

    try {
      const data = await getMe(session);
      console.log("[Bootstrap] Bootstrap data fetched:", data);
      
      if (data) {
        console.log("[Bootstrap] User onboarding status:", {
          isFirstTimeUser: data.isFirstTimeUser,
          onboardingCompletedAt: data.onboardingCompletedAt,
        });
      } else {
        console.warn("[Bootstrap] Failed to fetch bootstrap data - response was null");
      }
      
      setBootstrap(data);
    } catch (err) {
      console.error("[Bootstrap] Error fetching bootstrap:", err);
      setError(err instanceof Error ? err : new Error("Unknown error"));
      setBootstrap(null);
    } finally {
      setIsLoading(false);
    }
  }, [session]);

  useEffect(() => {
    fetchBootstrap();
  }, [fetchBootstrap]);

  const refetch = React.useCallback(async () => {
    await fetchBootstrap();
  }, [fetchBootstrap]);

  return (
    <BootstrapContext.Provider value={{ bootstrap, isLoading, error, refetch }}>
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
