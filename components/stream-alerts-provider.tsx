"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useObserverStream } from "@/hooks/snapshot/use-stream";

type ObserverStreamValue = ReturnType<typeof useObserverStream>;

const ObserverStreamContext = createContext<ObserverStreamValue | null>(null);

export function StreamAlertsProvider({ children }: { children: ReactNode }) {
  const stream = useObserverStream();

  return (
    <ObserverStreamContext.Provider value={stream}>{children}</ObserverStreamContext.Provider>
  );
}

export function useObserverStreamContext(): ObserverStreamValue {
  const context = useContext(ObserverStreamContext);
  if (!context) {
    throw new Error("useObserverStreamContext must be used within StreamAlertsProvider");
  }
  return context;
}

export function useStreamAlerts() {
  return useObserverStreamContext().alerts;
}
