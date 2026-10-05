import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Alert } from "@/types/alerts";
import { LAST_VISIT_AT_KEY } from "@/lib/alert-sound";

function makeStorage(initial: Record<string, string>) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  };
}

function triggeredAlert(id: string, triggeredAt: string): Alert {
  return {
    id,
    pair: "EURUSD",
    alert_type: "sweep_confirm",
    target_price: null,
    condition: null,
    interval: "5m",
    direction: null,
    threshold: null,
    last_evaluated_candle_time: null,
    status: "triggered",
    channel: "email",
    created_at: "2026-10-01T00:00:00.000Z",
    triggered_at: triggeredAt,
    last_checked_price: null,
  };
}

async function loadCenter(lastVisitAt: string | null) {
  vi.resetModules();
  const storage = makeStorage(lastVisitAt ? { [LAST_VISIT_AT_KEY]: lastVisitAt } : {});
  vi.stubGlobal("window", { localStorage: storage });
  const mod = await import("@/lib/notification-center");
  return mod.notificationCenter;
}

describe("notificationCenter.hydrateFromAlerts", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-05T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("announces triggers that fired since the last visit, newest first", async () => {
    const center = await loadCenter("2026-10-05T08:00:00.000Z");
    center.hydrateFromAlerts([
      triggeredAlert("old", "2026-10-05T07:00:00.000Z"),
      triggeredAlert("a", "2026-10-05T09:00:00.000Z"),
      triggeredAlert("b", "2026-10-05T10:00:00.000Z"),
    ]);

    expect(center.getActivityFeed().map((item) => item.alertId)).toEqual(["b", "a"]);
    expect(center.popNextToast()?.alertId).toBe("b");
    expect(center.popNextToast()?.alertId).toBe("a");
    expect(center.popNextToast()).toBeNull();
    expect(center.takeMissedSummaryCount()).toBe(0);
  });

  it("collapses many missed triggers into one summary", async () => {
    const center = await loadCenter("2026-10-05T08:00:00.000Z");
    center.hydrateFromAlerts(
      ["a", "b", "c", "d", "e"].map((id, i) => triggeredAlert(id, `2026-10-05T09:0${i}:00.000Z`)),
    );

    expect(center.peekToasts()).toHaveLength(0);
    expect(center.getActivityFeed()).toHaveLength(5);
    expect(center.takeMissedSummaryCount()).toBe(5);
    expect(center.takeMissedSummaryCount()).toBe(0);
  });

  it("does not announce anything on a first visit", async () => {
    const center = await loadCenter(null);
    center.hydrateFromAlerts([triggeredAlert("a", "2026-10-05T09:00:00.000Z")]);

    expect(center.peekToasts()).toHaveLength(0);
    expect(center.getActivityFeed()).toHaveLength(0);
  });
});
