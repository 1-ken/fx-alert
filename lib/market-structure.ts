import type { OhlcCandle } from "@/types/historical";

export const DEFAULT_MIN_SWING_ATR = 0;
export const DEFAULT_BREAK_K = 0.25;
export const DEFAULT_ATR_PERIOD = 14;
export const ATR_ZONE_K = 1.8;

export type StructureKind = "BOS" | "CHoCH" | "SWEEP";
export type StructureDir = "bull" | "bear";
export type StructureTrend = "up" | "down" | null;
export type PivotType = "high" | "low";
export type PivotLabel = "HH" | "HL" | "LH" | "LL";

export type StructurePivot = {
  type: PivotType;
  price: number;
  index: number;
  confirmedAt: number;
  timestamp: string;
  label: PivotLabel | null;
  quality: number;
  broken: boolean;
  brokenAt: number | null;
  swept: boolean;
};

export type StructureEvent = {
  kind: StructureKind;
  dir: StructureDir;
  level: number;
  fromIndex: number;
  index: number;
  timestamp: string;
  fromTimestamp: string;
  wick?: number;
  origin?: string;
};

export type StructureOptions = {
  minSwingATR?: number;
  breakK?: number;
  atrPeriod?: number;
};

export type MarketStructureResult = {
  pivots: StructurePivot[];
  events: StructureEvent[];
  trend: StructureTrend;
  lastHigh: StructurePivot | null;
  lastLow: StructurePivot | null;
  atr: number[];
  lastAtr: number | null;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function computeATR(candles: OhlcCandle[], period = DEFAULT_ATR_PERIOD): number[] {
  const n = candles.length;
  const atr: number[] = new Array(n);
  if (!n) {
    return atr;
  }
  let sum = 0;
  for (let i = 0; i < n; i += 1) {
    const c = candles[i];
    const prevClose = i === 0 ? c.close : candles[i - 1].close;
    const tr =
      i === 0
        ? c.high - c.low
        : Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose));
    if (i < period) {
      sum += tr;
      atr[i] = sum / (i + 1);
    } else {
      atr[i] = (atr[i - 1] * (period - 1) + tr) / period;
    }
  }
  return atr;
}

class FractalPivotDetector {
  minSwingATR: number;
  prev: OhlcCandle | null = null;
  prevPrev: OhlcCandle | null = null;
  lastHighPivot: StructurePivot | null = null;
  lastLowPivot: StructurePivot | null = null;

  constructor(minSwingATR = DEFAULT_MIN_SWING_ATR) {
    this.minSwingATR = minSwingATR;
  }

  update(candle: OhlcCandle, index: number, atr: number): StructurePivot | null {
    const c = candle;
    const p = this.prev;
    const pp = this.prevPrev;
    let pivot: StructurePivot | null = null;

    if (pp && p) {
      const isSwingHigh = p.high > pp.high && p.high > c.high;
      const isSwingLow = p.low < pp.low && p.low < c.low;

      if (isSwingHigh) {
        const leg = this.lastLowPivot ? Math.abs(p.high - this.lastLowPivot.price) : Infinity;
        const ok =
          this.minSwingATR <= 0 || !this.lastLowPivot || leg >= atr * this.minSwingATR;
        if (ok) {
          pivot = {
            type: "high",
            price: p.high,
            index: index - 1,
            confirmedAt: index,
            timestamp: p.timestamp,
            label: null,
            quality: 0,
            broken: false,
            brokenAt: null,
            swept: false,
          };
          this.lastHighPivot = pivot;
        }
      }
      if (isSwingLow && !pivot) {
        const leg = this.lastHighPivot ? Math.abs(p.low - this.lastHighPivot.price) : Infinity;
        const ok =
          this.minSwingATR <= 0 || !this.lastHighPivot || leg >= atr * this.minSwingATR;
        if (ok) {
          pivot = {
            type: "low",
            price: p.low,
            index: index - 1,
            confirmedAt: index,
            timestamp: p.timestamp,
            label: null,
            quality: 0,
            broken: false,
            brokenAt: null,
            swept: false,
          };
          this.lastLowPivot = pivot;
        }
      }
    }

    this.prevPrev = this.prev;
    this.prev = c;
    return pivot;
  }
}

class StructureEngine {
  lastHigh: StructurePivot | null = null;
  lastLow: StructurePivot | null = null;
  trend: StructureTrend = null;
  events: StructureEvent[] = [];
  breakK: number;

  constructor(breakK = DEFAULT_BREAK_K) {
    this.breakK = breakK;
  }

  onPivot(pivot: StructurePivot, atr: number): void {
    if (pivot.type === "high") {
      pivot.label = this.lastHigh ? (pivot.price > this.lastHigh.price ? "HH" : "LH") : null;
      const leg = this.lastLow ? Math.abs(pivot.price - this.lastLow.price) : 0;
      pivot.quality = clamp(leg / (atr * 4 || 1), 0, 1);
      this.lastHigh = pivot;
    } else {
      pivot.label = this.lastLow ? (pivot.price > this.lastLow.price ? "HL" : "LL") : null;
      const leg = this.lastHigh ? Math.abs(pivot.price - this.lastHigh.price) : 0;
      pivot.quality = clamp(leg / (atr * 4 || 1), 0, 1);
      this.lastLow = pivot;
    }
  }

  onBar(candle: OhlcCandle, index: number, atr: number): StructureEvent[] {
    const evs: StructureEvent[] = [];
    const buffer = atr * this.breakK;

    if (this.lastHigh && !this.lastHigh.broken) {
      if (candle.close > this.lastHigh.price + buffer) {
        const kind: StructureKind = this.trend === "down" ? "CHoCH" : "BOS";
        const ev: StructureEvent = {
          kind,
          dir: "bull",
          level: this.lastHigh.price,
          fromIndex: this.lastHigh.index,
          index,
          timestamp: candle.timestamp,
          fromTimestamp: this.lastHigh.timestamp,
        };
        evs.push(ev);
        this.trend = "up";
        this.lastHigh.broken = true;
        this.lastHigh.brokenAt = index;
      } else if (
        candle.high > this.lastHigh.price &&
        candle.close < this.lastHigh.price &&
        !this.lastHigh.swept
      ) {
        evs.push({
          kind: "SWEEP",
          dir: "bear",
          level: this.lastHigh.price,
          fromIndex: this.lastHigh.index,
          index,
          timestamp: candle.timestamp,
          fromTimestamp: this.lastHigh.timestamp,
          wick: candle.high,
          origin: this.lastHigh.label ?? "high",
        });
        this.lastHigh.swept = true;
      }
    }

    if (this.lastLow && !this.lastLow.broken) {
      if (candle.close < this.lastLow.price - buffer) {
        const kind: StructureKind = this.trend === "up" ? "CHoCH" : "BOS";
        const ev: StructureEvent = {
          kind,
          dir: "bear",
          level: this.lastLow.price,
          fromIndex: this.lastLow.index,
          index,
          timestamp: candle.timestamp,
          fromTimestamp: this.lastLow.timestamp,
        };
        evs.push(ev);
        this.trend = "down";
        this.lastLow.broken = true;
        this.lastLow.brokenAt = index;
      } else if (
        candle.low < this.lastLow.price &&
        candle.close > this.lastLow.price &&
        !this.lastLow.swept
      ) {
        evs.push({
          kind: "SWEEP",
          dir: "bull",
          level: this.lastLow.price,
          fromIndex: this.lastLow.index,
          index,
          timestamp: candle.timestamp,
          fromTimestamp: this.lastLow.timestamp,
          wick: candle.low,
          origin: this.lastLow.label ?? "low",
        });
        this.lastLow.swept = true;
      }
    }

    this.events.push(...evs);
    return evs;
  }
}

/**
 * Compute fractal swings, BOS/CHoCH, and sweeps from closed candles only.
 */
export function computeMarketStructure(
  candles: OhlcCandle[],
  options: StructureOptions = {},
): MarketStructureResult {
  const closed = candles.filter((c) => !c.is_forming);
  const minSwingATR = options.minSwingATR ?? DEFAULT_MIN_SWING_ATR;
  const breakK = options.breakK ?? DEFAULT_BREAK_K;
  const atrPeriod = options.atrPeriod ?? DEFAULT_ATR_PERIOD;
  const atr = computeATR(closed, atrPeriod);
  const detector = new FractalPivotDetector(minSwingATR);
  const engine = new StructureEngine(breakK);
  const pivots: StructurePivot[] = [];

  for (let i = 0; i < closed.length; i += 1) {
    const candle = closed[i];
    const barAtr = atr[i] ?? 0;
    const events = engine.onBar(candle, i, barAtr);
    void events;
    const pivot = detector.update(candle, i, barAtr);
    if (pivot) {
      engine.onPivot(pivot, barAtr);
      pivots.push(pivot);
    }
  }

  return {
    pivots,
    events: engine.events,
    trend: engine.trend,
    lastHigh: engine.lastHigh,
    lastLow: engine.lastLow,
    atr,
    lastAtr: atr.length > 0 ? atr[atr.length - 1] : null,
  };
}

export function structureEventKey(kind: StructureKind): "bos" | "choch" | "sweep" {
  if (kind === "CHoCH") {
    return "choch";
  }
  if (kind === "SWEEP") {
    return "sweep";
  }
  return "bos";
}
