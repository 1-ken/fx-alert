import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { toast } from "sonner";
import {
  FvgAlertMessageSchema,
  generateFvgCompositeId,
  type FvgAlertPayload,
  type FvgTimeframe,
} from "@/types/fvg";
import { fvgRateLimiter } from "@/lib/fvg-rate-limiter";
import { playAlertSound } from "@/lib/alert-sound";

type FvgState = {
  alerts: Record<string, FvgAlertPayload>;
  activeZones: Record<string, FvgAlertPayload>;
  filterSymbol: string | null;
  filterTimeframe: FvgTimeframe | null;
  soundEnabled: boolean;
  toastEnabled: boolean;
  fvgDetectorEnabled: boolean;

  ingestAlert: (payload: FvgAlertPayload) => void;
  setFilterSymbol: (symbol: string | null) => void;
  setFilterTimeframe: (tf: FvgTimeframe | null) => void;
  setSoundEnabled: (enabled: boolean) => void;
  setToastEnabled: (enabled: boolean) => void;
  setFvgDetectorEnabled: (enabled: boolean) => void;
  clearAlerts: () => void;
};

export const useFvgStore = create<FvgState>()(
  persist(
    (set, get) => ({
      alerts: {},
      activeZones: {},
      filterSymbol: null,
      filterTimeframe: null,
      soundEnabled: true,
      toastEnabled: true,
      fvgDetectorEnabled:
        typeof process !== "undefined" &&
        process.env.NEXT_PUBLIC_FVG_DETECTOR_ENABLED !== "false",

      ingestAlert: (payload: FvgAlertPayload) => {
        const state = get();
        if (!state.fvgDetectorEnabled) {
          return;
        }

        const compositeId = generateFvgCompositeId(
          payload.symbol,
          payload.timeframe,
          payload.bar_time,
        );

        const existing = state.alerts[compositeId];
        // Guard against duplicate alerts that could occur on reconnect
        if (existing && existing.status === payload.status) {
          return;
        }

        if (payload.status === "FORMED") {
          set((prev) => ({
            alerts: { ...prev.alerts, [compositeId]: payload },
            activeZones: { ...prev.activeZones, [compositeId]: payload },
          }));

          // Trigger sound rate-limited to 1 sound per symbol per minute
          if (state.soundEnabled && fvgRateLimiter.shouldPlaySound(payload.symbol)) {
            void playAlertSound().catch(() => {});
          }

          // Trigger toast notification
          if (state.toastEnabled && fvgRateLimiter.shouldShowToast(compositeId)) {
            const dirColor = payload.direction === "BULLISH" ? "🟢 Bullish" : "🔴 Bearish";
            toast.info(`FVG Formed: ${payload.symbol} (${payload.timeframe})`, {
              description: `${dirColor} gap [${payload.bottom.toFixed(5)} – ${payload.top.toFixed(5)}]`,
            });
          }
        } else if (payload.status === "MITIGATED") {
          set((prev) => {
            const nextAlerts = { ...prev.alerts, [compositeId]: payload };
            const nextActive = { ...prev.activeZones };
            delete nextActive[compositeId];
            return { alerts: nextAlerts, activeZones: nextActive };
          });
        }
      },

      setFilterSymbol: (filterSymbol) => set({ filterSymbol }),
      setFilterTimeframe: (filterTimeframe) => set({ filterTimeframe }),
      setSoundEnabled: (soundEnabled) => set({ soundEnabled }),
      setToastEnabled: (toastEnabled) => set({ toastEnabled }),
      setFvgDetectorEnabled: (fvgDetectorEnabled) => set({ fvgDetectorEnabled }),
      clearAlerts: () => set({ alerts: {}, activeZones: {} }),
    }),
    {
      name: "fx-fvg-store",
      storage: createJSONStorage(() =>
        typeof window !== "undefined"
          ? window.localStorage
          : {
              getItem: () => null,
              setItem: () => {},
              removeItem: () => {},
            },
      ),
      partialize: (state) => ({
        soundEnabled: state.soundEnabled,
        toastEnabled: state.toastEnabled,
        fvgDetectorEnabled: state.fvgDetectorEnabled,
      }),
    },
  ),
);

/**
 * Defensive WebSocket message handler for FVG alerts.
 * Uses Zod validation to parse payloads safely without throwing runtime errors.
 */
export function handleFvgWebSocketMessage(raw: unknown): boolean {
  try {
    const parsed = FvgAlertMessageSchema.safeParse(raw);
    if (!parsed.success) {
      return false;
    }

    useFvgStore.getState().ingestAlert(parsed.data.data);
    return true;
  } catch (err) {
    console.error("[FVG] Failed to handle message:", err);
    return false;
  }
}
