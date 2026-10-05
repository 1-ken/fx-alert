import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Alert, AlertEvent } from "@/types/alerts";
import { LAST_VISIT_AT_KEY } from "@/lib/alert-sound";

function makeStorage(initial: Record<string, string>) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  };
}

function firing(id: string, triggeredAt: string, readAt: string | null = null): AlertEvent {
  return {
    id,
    user_id: "u",
    alert_id: "sweep-1",
    pair: "EURUSD",
    alert_type: "sweep_confirm",
    timeframe: "5m",
    price: 1.1,
    triggered_at: triggeredAt,
    read_at: readAt,
    data: { id: "sweep-1", channel: "email", status: "active" } as Alert,
  };
}

async function loadCenter(lastVisitAt: string | null) {
  vi.resetModules();
  const storage = makeStorage(lastVisitAt ? { [LAST_VISIT_AT_KEY]: lastVisitAt } : {});
  vi.stubGlobal("window", { localStorage: storage });
  const mod = await import("@/lib/notification-center");
  return mod.notificationCenter;
}

describe("notificationCenter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-05T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("announces unread firings since the last visit, newest first", async () => {
    const center = await loadCenter("2026-10-05T08:00:00.000Z");
    center.hydrateFromEvents([
      firing("e3", "2026-10-05T10:00:00.000Z"),
      firing("e2", "2026-10-05T09:00:00.000Z"),
      firing("read", "2026-10-05T09:30:00.000Z", "2026-10-05T09:31:00.000Z"),
      firing("old", "2026-10-05T07:00:00.000Z"),
    ]);

    expect(center.getActivityFeed().map((item) => item.eventId)).toEqual(["e3", "e2"]);
    const first = center.popNextToast();
    expect(first?.eventId).toBe("e3");
    expect(first?.alertId).toBe("sweep-1");
    expect(center.popNextToast()?.eventId).toBe("e2");
    expect(center.popNextToast()).toBeNull();
    expect(center.takeSummaryCount()).toBe(0);
  });

  it("collapses many missed firings into one summary", async () => {
    const center = await loadCenter("2026-10-05T08:00:00.000Z");
    center.hydrateFromEvents(
      ["a", "b", "c", "d", "e"].map((id, i) => firing(id, `2026-10-05T09:0${i}:00.000Z`)),
    );

    expect(center.peekToasts()).toHaveLength(0);
    expect(center.getActivityFeed()).toHaveLength(5);
    expect(center.takeSummaryCount()).toBe(5);
    expect(center.takeSummaryCount()).toBe(0);
  });

  it("does not announce anything on a first visit", async () => {
    const center = await loadCenter(null);
    center.hydrateFromEvents([firing("a", "2026-10-05T09:00:00.000Z")]);

    expect(center.peekToasts()).toHaveLength(0);
    expect(center.getActivityFeed()).toHaveLength(0);
  });

  it("announces each new firing of a repeating alert after hydration", async () => {
    const center = await loadCenter("2026-10-05T08:00:00.000Z");
    center.hydrateFromEvents([]);
    center.ingestEvents([firing("e1", "2026-10-05T11:00:00.000Z")]);
    center.ingestEvents([
      firing("e2", "2026-10-05T11:30:00.000Z"),
      firing("e1", "2026-10-05T11:00:00.000Z"),
    ]);

    expect(center.popNextToast()?.eventId).toBe("e2");
    expect(center.popNextToast()?.eventId).toBe("e1");
    expect(center.popNextToast()).toBeNull();
  });
});
