import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  FvgAlertMessageSchema,
  FvgAlertPayloadSchema,
  generateFvgCompositeId,
  normalizeFvgTimeframe,
  type FvgAlertPayload,
} from "@/types/fvg";
import { handleFvgWebSocketMessage, useFvgStore } from "@/stores/fvg-store";

const { toastInfo, playSound } = vi.hoisted(() => ({
  toastInfo: vi.fn(),
  playSound: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { info: toastInfo } }));
vi.mock("@/lib/alert-sound", () => ({ playAlertSound: playSound }));

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

const zone = (over: Partial<FvgAlertPayload> = {}): FvgAlertPayload => ({
  id: "EURUSD_M15_1710000000",
  symbol: "EURUSD",
  timeframe: "M15",
  direction: "BULLISH",
  top: 1.0855,
  bottom: 1.0848,
  bar_time: 1710000000,
  status: "FORMED",
  ...over,
});

describe("FVG store is a silent chart-zone cache (no user notifications)", () => {
  beforeEach(() => {
    useFvgStore.getState().clearZones();
    useFvgStore.getState().setFvgDetectorEnabled(true);
  });

  it("ingests formed zones and removes them on mitigation", () => {
    useFvgStore.getState().ingestZone(zone());
    const key = "EURUSD_M15_1710000000";
    expect(useFvgStore.getState().activeZones[key]?.status).toBe("FORMED");

    useFvgStore.getState().ingestZone(zone({ status: "MITIGATED" }));
    expect(useFvgStore.getState().activeZones[key]).toBeUndefined();
  });

  it("never raises toast or sound when a zone arrives", () => {
    useFvgStore.getState().ingestZone(zone());
    expect(toastInfo).not.toHaveBeenCalled();
    expect(playSound).not.toHaveBeenCalled();
  });

  it("ignores zones when the detector flag is off", () => {
    useFvgStore.getState().setFvgDetectorEnabled(false);
    useFvgStore.getState().ingestZone(zone());
    expect(Object.keys(useFvgStore.getState().activeZones)).toHaveLength(0);
  });

  it("chart overlay toggle defaults to off", () => {
    expect(useFvgStore.getState().showFvgOnChart).toBe(false);
  });

  it("safely routes through handleFvgWebSocketMessage", () => {
    const frame = { type: "FVG_ALERT", data: zone({ symbol: "USDJPY", timeframe: "H1" }) };
    expect(handleFvgWebSocketMessage(frame)).toBe(true);
    expect(
      useFvgStore.getState().activeZones["USDJPY_H1_1710000000"],
    ).toBeDefined();
    expect(handleFvgWebSocketMessage({ type: "UNKNOWN" })).toBe(false);
  });

  it("hydrates one symbol only, never the whole market", async () => {
    const fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      json: async () => ({
        enabled: true,
        zones: [zone({ symbol: "GBPJPY", timeframe: "H1", bar_time: 1710003600 })],
      }),
      url,
    }));
    const original = global.fetch;
    global.fetch = fetchMock as unknown as typeof fetch;
    try {
      // No symbol -> no request at all.
      await useFvgStore.getState().hydrateActiveZones("");
      expect(fetchMock).not.toHaveBeenCalled();

      useFvgStore.getState().ingestZone(zone()); // EURUSD zone must survive GBPJPY hydrate
      await useFvgStore.getState().hydrateActiveZones("GBPJPY", "1h");

      const calledUrl = String(fetchMock.mock.calls[0]?.[0]);
      expect(calledUrl).toContain("symbol=GBPJPY");
      expect(calledUrl).toContain("timeframe=H1");
      const zones = useFvgStore.getState().activeZones;
      expect(zones["GBPJPY_H1_1710003600"]).toBeDefined();
      expect(zones["EURUSD_M15_1710000000"]).toBeDefined();
    } finally {
      global.fetch = original;
    }
  });
});
