import { describe, expect, it, beforeEach } from "vitest";
import {
  FvgAlertMessageSchema,
  FvgAlertPayloadSchema,
  generateFvgCompositeId,
  normalizeFvgTimeframe,
  type FvgAlertPayload,
} from "@/types/fvg";
import { fvgRateLimiter } from "@/lib/fvg-rate-limiter";
import { handleFvgWebSocketMessage, useFvgStore } from "@/stores/fvg-store";

describe("FVG Types & Defensive Zod Validation", () => {
  it("successfully validates a well-formed FVG payload", () => {
    const raw = {
      id: "EURUSD_M15_1710000000",
      symbol: "EURUSD",
      timeframe: "M15",
      direction: "BULLISH",
      top: 1.0855,
      bottom: 1.0848,
      bar_time: 1710000000,
      status: "FORMED",
    };

    const parsed = FvgAlertPayloadSchema.safeParse(raw);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.symbol).toBe("EURUSD");
      expect(parsed.data.timeframe).toBe("M15");
      expect(parsed.data.direction).toBe("BULLISH");
      expect(parsed.data.top).toBe(1.0855);
      expect(parsed.data.bottom).toBe(1.0848);
    }
  });

  it("safely rejects malformed payloads without throwing runtime errors", () => {
    // Missing required fields
    const malformed1 = { symbol: "EURUSD" };
    expect(FvgAlertPayloadSchema.safeParse(malformed1).success).toBe(false);

    // Invalid timeframe
    const malformed2 = {
      id: "test",
      symbol: "EURUSD",
      timeframe: "INVALID",
      direction: "BULLISH",
      top: 1.08,
      bottom: 1.07,
      bar_time: 1710000000,
      status: "FORMED",
    };
    expect(FvgAlertPayloadSchema.safeParse(malformed2).success).toBe(false);

    // Invalid status
    const malformed3 = {
      id: "test",
      symbol: "EURUSD",
      timeframe: "M15",
      direction: "BULLISH",
      top: 1.08,
      bottom: 1.07,
      bar_time: 1710000000,
      status: "UNKNOWN",
    };
    expect(FvgAlertPayloadSchema.safeParse(malformed3).success).toBe(false);
  });

  it("validates WebSocket wire message frame", () => {
    const frame = {
      type: "FVG_ALERT",
      data: {
        id: "GBPUSD_H1_1710000000",
        symbol: "GBPUSD",
        timeframe: "H1",
        direction: "BEARISH",
        top: 1.285,
        bottom: 1.281,
        bar_time: 1710000000,
        status: "FORMED",
      },
    };
    expect(FvgAlertMessageSchema.safeParse(frame).success).toBe(true);

    const wrongType = { ...frame, type: "PRICE_ALERT" };
    expect(FvgAlertMessageSchema.safeParse(wrongType).success).toBe(false);
  });

  it("generates composite IDs and normalizes timeframes", () => {
    expect(generateFvgCompositeId("EURUSD", "M15", 1710000000)).toBe("EURUSD_M15_1710000000");
    expect(normalizeFvgTimeframe("15m")).toBe("M15");
    expect(normalizeFvgTimeframe("1h")).toBe("H1");
    expect(normalizeFvgTimeframe("M5")).toBe("M5");
    expect(normalizeFvgTimeframe("unknown")).toBeNull();
  });
});

describe("FVG Rate Limiter", () => {
  beforeEach(() => {
    fvgRateLimiter.reset();
  });

  it("allows the first sound and throttles subsequent sounds within 60s for the same symbol", () => {
    const t0 = 100000;
    expect(fvgRateLimiter.shouldPlaySound("EURUSD", t0)).toBe(true);

    // 10 seconds later: should be throttled
    expect(fvgRateLimiter.shouldPlaySound("EURUSD", t0 + 10_000)).toBe(false);

    // Different symbol: should be allowed
    expect(fvgRateLimiter.shouldPlaySound("GBPUSD", t0 + 10_000)).toBe(true);

    // 61 seconds later for EURUSD: should be allowed again
    expect(fvgRateLimiter.shouldPlaySound("EURUSD", t0 + 61_000)).toBe(true);
  });

  it("throttles rapid duplicate toasts for the same alert ID", () => {
    const t0 = 100000;
    expect(fvgRateLimiter.shouldShowToast("alert-1", t0)).toBe(true);
    expect(fvgRateLimiter.shouldShowToast("alert-1", t0 + 5_000)).toBe(false);
    expect(fvgRateLimiter.shouldShowToast("alert-1", t0 + 11_000)).toBe(true);
  });
});

describe("FVG Zustand Store & Lifecycle", () => {
  beforeEach(() => {
    useFvgStore.getState().clearAlerts();
    useFvgStore.getState().setFvgDetectorEnabled(true);
    fvgRateLimiter.reset();
  });

  it("ingests formed alert and handles mitigation", () => {
    const formedPayload: FvgAlertPayload = {
      id: "EURUSD_M15_1710000000",
      symbol: "EURUSD",
      timeframe: "M15",
      direction: "BULLISH",
      top: 1.0855,
      bottom: 1.0848,
      bar_time: 1710000000,
      status: "FORMED",
    };

    useFvgStore.getState().ingestAlert(formedPayload);
    const state1 = useFvgStore.getState();
    const key = "EURUSD_M15_1710000000";
    expect(state1.alerts[key]).toBeDefined();
    expect(state1.activeZones[key]).toBeDefined();
    expect(state1.activeZones[key]?.status).toBe("FORMED");

    // Mitigated update
    const mitigatedPayload: FvgAlertPayload = {
      ...formedPayload,
      status: "MITIGATED",
    };

    useFvgStore.getState().ingestAlert(mitigatedPayload);
    const state2 = useFvgStore.getState();
    expect(state2.alerts[key]?.status).toBe("MITIGATED");
    expect(state2.activeZones[key]).toBeUndefined();
  });

  it("safely routes through handleFvgWebSocketMessage", () => {
    const frame = {
      type: "FVG_ALERT",
      data: {
        id: "USDJPY_H1_1710000000",
        symbol: "USDJPY",
        timeframe: "H1",
        direction: "BEARISH",
        top: 150.5,
        bottom: 150.2,
        bar_time: 1710000000,
        status: "FORMED",
      },
    };

    const res = handleFvgWebSocketMessage(frame);
    expect(res).toBe(true);

    const key = "USDJPY_H1_1710000000";
    expect(useFvgStore.getState().activeZones[key]).toBeDefined();

    // Invalid frame returns false safely
    expect(handleFvgWebSocketMessage({ type: "UNKNOWN" })).toBe(false);
  });
});
