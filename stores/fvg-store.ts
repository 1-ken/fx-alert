import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  FvgAlertMessageSchema,
  FvgAlertPayloadSchema,
  generateFvgCompositeId,
  normalizeFvgTimeframe,
  type FvgAlertPayload,
} from "@/types/fvg";

/**
 * FVG zone cache used ONLY for chart overlays.
 *
 * FVG *alerts* (toast / sound / SMS / email / call) are user-owned alerts and are delivered
 * through the regular `alert_triggered` stream, exactly like every other alert type.
 * Nothing in this store may notify the user.
 */
type FvgState = {
  activeZones: Record<string, FvgAlertPayload>;
  showFvgOnChart: boolean;
  fvgDetectorEnabled: boolean;

  ingestZone: (payload: FvgAlertPayload) => void;
  hydrateActiveZones: (symbol: string, timeframe?: string) => Promise<void>;
  setShowFvgOnChart: (show: boolean) => void;
  setFvgDetectorEnabled: (enabled: boolean) => void;
  clearZones: () => void;
};

export const useFvgStore = create<FvgState>()(
  persist(
    (set, get) => ({
      activeZones: {},
      showFvgOnChart: false,
      fvgDetectorEnabled:
        typeof process !== "undefined" &&
        process.env.NEXT_PUBLIC_FVG_DETECTOR_ENABLED !== "false",

      ingestZone: (payload: FvgAlertPayload) => {
        if (!get().fvgDetectorEnabled) {
          return;
        }
        const compositeId = generateFvgCompositeId(
          payload.symbol,
          payload.timeframe,
          payload.bar_time,
        );
        if (payload.status === "FORMED") {
          set((prev) => ({
            activeZones: { ...prev.activeZones, [compositeId]: payload },
          }));
        } else if (payload.status === "MITIGATED") {
          set((prev) => {
            if (!(compositeId in prev.activeZones)) return prev;
            const next = { ...prev.activeZones };
            delete next[compositeId];
            return { activeZones: next };
          });
        }
      },

      hydrateActiveZones: async (symbol: string, timeframe?: string) => {
        const sym = symbol.trim();
        // Never load a market-wide list: zones are fetched per chart symbol only.
        if (!sym) return;
        try {
          const params = new URLSearchParams({ symbol: sym });
          const tf = timeframe ? normalizeFvgTimeframe(timeframe) : null;
          if (tf) params.set("timeframe", tf);
          const res = await fetch(`/api/observer/fvg/active?${params.toString()}`);
          if (!res.ok) return;
          const json = await res.json();
          if (!json?.enabled || !Array.isArray(json?.zones)) return;

          const incoming: Record<string, FvgAlertPayload> = {};
          for (const item of json.zones) {
            const parsed = FvgAlertPayloadSchema.safeParse(item);
            if (!parsed.success) continue;
            const z = parsed.data;
            incoming[generateFvgCompositeId(z.symbol, z.timeframe, z.bar_time)] = z;
          }
          set((prev) => {
            const kept: Record<string, FvgAlertPayload> = {};
            for (const [id, z] of Object.entries(prev.activeZones)) {
              // Replace the zones for this symbol (and timeframe, if given) with server truth.
              const sameSymbol = z.symbol.toUpperCase() === sym.toUpperCase();
              const sameTf = !tf || z.timeframe === tf;
              if (!(sameSymbol && sameTf)) kept[id] = z;
            }
            return { activeZones: { ...kept, ...incoming } };
          });
        } catch (err) {
          console.warn("[FVG Store] Failed to hydrate active zones:", err);
        }
      },

      setShowFvgOnChart: (showFvgOnChart) => set({ showFvgOnChart }),
      setFvgDetectorEnabled: (fvgDetectorEnabled) => set({ fvgDetectorEnabled }),
      clearZones: () => set({ activeZones: {} }),
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
        showFvgOnChart: state.showFvgOnChart,
        fvgDetectorEnabled: state.fvgDetectorEnabled,
      }),
    },
  ),
);

/**
 * Defensive WebSocket handler for FVG zone frames (silent chart data).
 * Uses Zod validation so malformed packets can never throw.
 */
export function handleFvgWebSocketMessage(raw: unknown): boolean {
  try {
    const parsed = FvgAlertMessageSchema.safeParse(raw);
    if (!parsed.success) {
      return false;
    }
    useFvgStore.getState().ingestZone(parsed.data.data);
    return true;
  } catch (err) {
    console.error("[FVG] Failed to handle message:", err);
    return false;
  }
}
