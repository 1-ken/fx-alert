export type CandleColorSchemeId =
  | "green_red"
  | "red_green"
  | "teal_red"
  | "white_black"
  | "blue_red";

export type CandleColorScheme = {
  id: CandleColorSchemeId;
  label: string;
  up: string;
  down: string;
};

export const CANDLE_COLOR_SCHEMES: CandleColorScheme[] = [
  { id: "green_red", label: "Green / Red", up: "#22c55e", down: "#ef4444" },
  { id: "red_green", label: "Red / Green", up: "#ef4444", down: "#22c55e" },
  { id: "teal_red", label: "Teal / Red", up: "#26a69a", down: "#ef5350" },
  { id: "white_black", label: "White / Black", up: "#f4f4f5", down: "#18181b" },
  { id: "blue_red", label: "Blue / Red", up: "#3b82f6", down: "#ef4444" },
];

export const DEFAULT_CANDLE_COLOR_SCHEME: CandleColorSchemeId = "green_red";
export const CANDLE_COLOR_STORAGE_KEY = "fx-alert:candle-color-scheme";

export function candleColorSchemeById(
  id: string | null | undefined,
): CandleColorScheme {
  return (
    CANDLE_COLOR_SCHEMES.find((scheme) => scheme.id === id) ??
    CANDLE_COLOR_SCHEMES[0]
  );
}

export function loadCandleColorSchemeId(): CandleColorSchemeId {
  if (typeof window === "undefined") {
    return DEFAULT_CANDLE_COLOR_SCHEME;
  }
  try {
    const stored = localStorage.getItem(CANDLE_COLOR_STORAGE_KEY);
    const match = CANDLE_COLOR_SCHEMES.find((scheme) => scheme.id === stored);
    return match?.id ?? DEFAULT_CANDLE_COLOR_SCHEME;
  } catch {
    return DEFAULT_CANDLE_COLOR_SCHEME;
  }
}

export function saveCandleColorSchemeId(id: CandleColorSchemeId): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    localStorage.setItem(CANDLE_COLOR_STORAGE_KEY, id);
  } catch {
    // Ignore quota errors.
  }
}

export function candleBarStyles(scheme: CandleColorScheme) {
  return {
    upColor: scheme.up,
    downColor: scheme.down,
    noChangeColor: scheme.up,
    upBorderColor: scheme.up === "#f4f4f5" ? "#a1a1aa" : scheme.up,
    downBorderColor: scheme.down,
    noChangeBorderColor: scheme.up,
    upWickColor: scheme.up === "#f4f4f5" ? "#a1a1aa" : scheme.up,
    downWickColor: scheme.down,
    noChangeWickColor: scheme.up,
  };
}
