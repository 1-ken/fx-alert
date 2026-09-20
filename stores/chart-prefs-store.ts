import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  DEFAULT_STRUCTURE_LAYERS,
  type StructureLayerFlags,
} from "@/lib/structure-overlay";

type ChartPrefsState = {
  layers: StructureLayerFlags;
  followLive: boolean;
  drawingSnap: boolean;
  setLayer: (key: keyof StructureLayerFlags, value: boolean) => void;
  toggleLayer: (key: keyof StructureLayerFlags) => void;
  setFollowLive: (value: boolean) => void;
  setDrawingSnap: (value: boolean) => void;
};

/**
 * Chart display prefs shared across timeframes (and pairs).
 * Drawings/indicators stay in per-pair+interval sessionStorage.
 */
export const useChartPrefsStore = create<ChartPrefsState>()(
  persist(
    (set) => ({
      layers: DEFAULT_STRUCTURE_LAYERS,
      followLive: true,
      drawingSnap: true,
      setLayer: (key, value) =>
        set((state) => ({ layers: { ...state.layers, [key]: value } })),
      toggleLayer: (key) =>
        set((state) => ({
          layers: { ...state.layers, [key]: !state.layers[key] },
        })),
      setFollowLive: (followLive) => set({ followLive }),
      setDrawingSnap: (drawingSnap) => set({ drawingSnap }),
    }),
    {
      name: "fx-chart-prefs",
      partialize: (state) => ({
        layers: state.layers,
        followLive: state.followLive,
        drawingSnap: state.drawingSnap,
      }),
    },
  ),
);
