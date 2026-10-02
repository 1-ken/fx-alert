import { describe, expect, it } from "vitest";
import { markAllEventsReadInList, markEventReadInList } from "@/hooks/alerts/use-alert-events";
import type { AlertEventsResponse } from "@/types/alerts";

function sample(): AlertEventsResponse {
  return {
    unread_count: 2,
    events: [
      {
        id: "e1",
        user_id: "u",
        alert_id: "a1",
        pair: "EURUSD",
        alert_type: "sweep_confirm",
        timeframe: "5m",
        price: 1.1,
        triggered_at: "2026-06-03T22:35:00.000000Z",
        read_at: null,
        data: {} as AlertEventsResponse["events"][number]["data"],
      },
      {
        id: "e2",
        user_id: "u",
        alert_id: "a1",
        pair: "EURUSD",
        alert_type: "sweep_confirm",
        timeframe: "5m",
        price: 1.08,
        triggered_at: "2026-06-03T23:10:00.000000Z",
        read_at: null,
        data: {} as AlertEventsResponse["events"][number]["data"],
      },
    ],
  };
}

describe("alert event read updates", () => {
  it("marks one event read and drops the unread count by one", () => {
    const next = markEventReadInList(sample(), "e1", "2026-06-04T00:00:00.000Z");
    expect(next.events[0]?.read_at).toBe("2026-06-04T00:00:00.000Z");
    expect(next.events[1]?.read_at).toBeNull();
    expect(next.unread_count).toBe(1);
  });

  it("does not change the count when the event is already read", () => {
    const once = markEventReadInList(sample(), "e1", "2026-06-04T00:00:00.000Z");
    const twice = markEventReadInList(once, "e1", "2026-06-04T01:00:00.000Z");
    expect(twice.events[0]?.read_at).toBe("2026-06-04T00:00:00.000Z");
    expect(twice.unread_count).toBe(1);
  });

  it("marks every event read", () => {
    const next = markAllEventsReadInList(sample(), "2026-06-04T00:00:00.000Z");
    expect(next.unread_count).toBe(0);
    expect(next.events.every((event) => event.read_at)).toBe(true);
  });
});
