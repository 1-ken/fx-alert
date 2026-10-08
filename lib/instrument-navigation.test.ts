import { describe, expect, it } from "vitest";
import {
  buildTriggeredChartUrl,
  resolveTriggerChartInterval,
} from "@/lib/instrument-navigation";

describe("buildTriggeredChartUrl", () => {
  it("uses the evaluated candle time and alert interval", () => {
    const url = buildTriggeredChartUrl({
      pair: "EUR/USD",
      alertType: "candle_close",
      interval: "15m",
      candleTime: "2026-10-08T04:15:00.000Z",
      triggeredAt: "2026-10-08T04:30:00.000Z",
      price: 1.08421,
    });
    const parsed = new URL(url, "http://local");
    expect(parsed.pathname).toBe("/instruments/EURUSD");
    expect(parsed.searchParams.get("interval")).toBe("15m");
    expect(parsed.searchParams.get("at")).toBe("2026-10-08T04:15:00.000Z");
    expect(parsed.searchParams.get("price")).toBe("1.08421");
  });

  it("falls back to the trigger time on the default interval for price alerts", () => {
    expect(
      resolveTriggerChartInterval({
        pair: "XAUUSD",
        alertType: "price",
        triggeredAt: "2026-10-08T04:16:00.000Z",
      }),
    ).toBe("5m");
  });
});
