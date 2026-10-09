import { describe, expect, it } from "vitest";
import {
  buildWatchPayload,
  checkWatchRequest,
  chunkPairs,
  collectWatchAlertIds,
  defaultWatchExpiry,
  planWatchSteps,
  summarizeWatched,
  validateSessionDirection,
} from "@/lib/favorite-watch";
import type { Alert } from "@/types/alerts";

const NOW = Date.parse("2026-06-03T10:00:00Z");
const ctx = { channel: "call" as const, phone: "+254712345678", email: "", now: NOW };

function alert(partial: Partial<Alert> & Pick<Alert, "id" | "pair" | "alert_type">): Alert {
  return { status: "active", ...partial } as Alert;
}

describe("buildWatchPayload", () => {
  it("builds the four default payloads", () => {
    const pdh = buildWatchPayload("prev_day_level", ["EUR/USD", "gbpusd"], ctx);
    expect(pdh.pairs).toEqual(["EURUSD", "GBPUSD"]);
    expect(pdh.level_ref).toBe("both");
    expect(pdh.dol_trigger).toEqual(["sweep"]);
    expect(pdh.expires_at).toBe("2026-06-03T23:59:59.999Z");
    expect(pdh.channels).toEqual(["call", "sound"]);
    expect(pdh.phone).toBe("+254712345678");

    const session = buildWatchPayload("structure_session", ["EURUSD"], ctx);
    expect(session.intervals).toEqual(["5m"]);
    expect(session.structure_direction).toBe("any");
    expect(session.structure_event).toEqual(["bos", "choch", "sweep"]);
    expect(session.expires_at).toBe("2026-06-04T10:00:00.000Z");

    const sweep = buildWatchPayload("sweep_confirm", ["EURUSD"], ctx);
    expect(sweep.structure_event).toEqual(["bos", "cisd"]);
    expect(sweep.interval).toBe("5m");

    const hour = buildWatchPayload("hour_sweep_cisd", ["EURUSD"], ctx);
    expect(hour.structure_event).toEqual(["cisd"]);
    expect(hour.structure_direction).toBe("any");
  });

  it("sends the trimmed message for call and sms, never for sound or email", () => {
    const call = buildWatchPayload("sweep_confirm", ["EURUSD"], { ...ctx, message: "  Watch  " });
    expect(call.custom_message).toBe("Watch");
    const sms = buildWatchPayload("sweep_confirm", ["EURUSD"], {
      ...ctx,
      channel: "sms",
      message: "Hi",
    });
    expect(sms.custom_message).toBe("Hi");
    const sound = buildWatchPayload("sweep_confirm", ["EURUSD"], {
      ...ctx,
      channel: "sound",
      message: "Hi",
    });
    expect(sound.custom_message).toBeUndefined();
    const email = buildWatchPayload("sweep_confirm", ["EURUSD"], {
      ...ctx,
      channel: "email",
      email: "a@b.co",
      message: "Hi",
    });
    expect(email.custom_message).toBeUndefined();
  });

  it("sends only sound when the default is in-app", () => {
    const p = buildWatchPayload("sweep_confirm", ["EURUSD"], { ...ctx, channel: "sound" });
    expect(p.channels).toEqual(["sound"]);
    expect(p.phone).toBe("");
    expect(p.email).toBeUndefined();
  });

  it("uses end of day for PDH and 24h for the rest", () => {
    expect(defaultWatchExpiry("prev_day_level", NOW)).toBe("2026-06-03T23:59:59.999Z");
    expect(defaultWatchExpiry("hour_sweep_cisd", NOW)).toBe("2026-06-04T10:00:00.000Z");
  });
});

describe("validateSessionDirection", () => {
  it("allows any for one timeframe only", () => {
    expect(validateSessionDirection(["5m"], "any")).toBeNull();
    expect(validateSessionDirection(["5m", "15m"], "any")).not.toBeNull();
    expect(validateSessionDirection(["5m", "15m"], "bull")).toBeNull();
    expect(validateSessionDirection([], "bull")).not.toBeNull();
  });
});

describe("planWatchSteps", () => {
  it("orders types and chunks pairs at 100", () => {
    const pairs = Array.from({ length: 230 }, (_, i) => `AAA${String(i).padStart(3, "0")}`);
    const steps = planWatchSteps(["hour_sweep_cisd", "prev_day_level"], pairs);
    expect(steps.map((s) => s.type)).toEqual([
      "prev_day_level",
      "prev_day_level",
      "prev_day_level",
      "hour_sweep_cisd",
      "hour_sweep_cisd",
      "hour_sweep_cisd",
    ]);
    expect(steps[0].pairs).toHaveLength(100);
    expect(steps[2].pairs).toHaveLength(30);
    expect(chunkPairs([1, 2, 3], 2)).toEqual([[1, 2], [3]]);
  });

  it("dedupes pairs that normalize to the same key", () => {
    const steps = planWatchSteps(["sweep_confirm"], ["EUR/USD", "EURUSD"]);
    expect(steps).toEqual([{ type: "sweep_confirm", pairs: ["EURUSD"] }]);
  });
});

describe("checkWatchRequest", () => {
  const base = {
    types: ["prev_day_level", "sweep_confirm"] as const,
    pairs: ["EURUSD", "GBPUSD"],
    channel: "sound" as const,
    phone: "",
    email: "",
    bootstrap: { subscriptionTier: "trial" } as never,
    activeCount: 0,
  };

  it("counts pairs times types", () => {
    expect(checkWatchRequest(base)).toEqual({ ok: true, total: 4 });
  });

  it("blocks empty favorites and empty types", () => {
    expect(checkWatchRequest({ ...base, pairs: [] }).ok).toBe(false);
    expect(checkWatchRequest({ ...base, types: [] }).ok).toBe(false);
  });

  it("requires a message for call and sms only", () => {
    const withPhone = { ...base, phone: "+254712345678" };
    expect(checkWatchRequest({ ...withPhone, channel: "call" }).ok).toBe(false);
    expect(checkWatchRequest({ ...withPhone, channel: "call", message: "   " }).ok).toBe(false);
    expect(checkWatchRequest({ ...withPhone, channel: "call", message: "Watch" }).ok).toBe(true);
    expect(checkWatchRequest({ ...withPhone, channel: "sms", message: "Watch" }).ok).toBe(true);
    expect(checkWatchRequest({ ...base, channel: "sound" }).ok).toBe(true);
    expect(
      checkWatchRequest({ ...base, channel: "email", email: "a@b.co" }).ok,
    ).toBe(true);
  });

  it("limits message length per channel", () => {
    const withPhone = { ...base, phone: "+254712345678" };
    const long = "x".repeat(550);
    expect(checkWatchRequest({ ...withPhone, channel: "call", message: long }).ok).toBe(true);
    expect(checkWatchRequest({ ...withPhone, channel: "sms", message: long }).ok).toBe(false);
    expect(
      checkWatchRequest({ ...withPhone, channel: "call", message: "x".repeat(601) }).ok,
    ).toBe(false);
  });

  it("blocks call without a phone", () => {
    const res = checkWatchRequest({ ...base, channel: "call" });
    expect(res.ok).toBe(false);
  });

  it("blocks when the free plan cannot fit the total", () => {
    const res = checkWatchRequest({
      ...base,
      bootstrap: { subscriptionTier: "free" } as never,
      activeCount: 3,
    });
    expect(res).toEqual({
      ok: false,
      error: "You can add 2 more alerts; this would add 4. Uncheck pairs or types.",
    });
  });
});

describe("summarizeWatched", () => {
  it("groups the four types by normalized pair and counts duplicates", () => {
    const summary = summarizeWatched(
      [
        alert({ id: "a", pair: "EURUSD", alert_type: "structure_session" }),
        alert({ id: "b", pair: "EUR/USD", alert_type: "structure_session" }),
        alert({ id: "c", pair: "EURUSD", alert_type: "hour_sweep_cisd" }),
        alert({ id: "d", pair: "GBPUSD", alert_type: "sweep_confirm", status: "waiting" }),
      ],
      ["EUR/USD", "GBP/USD", "USD/JPY"],
    );
    expect(summary.pairs.map((p) => p.pair)).toEqual(["EUR/USD", "GBP/USD"]);
    expect(summary.pairs[0].byType.structure_session).toEqual(["a", "b"]);
    expect(summary.pairs[0].byType.hour_sweep_cisd).toEqual(["c"]);
    expect(summary.unwatchedFavorites).toEqual(["USD/JPY"]);
  });

  it("ignores other types, triggered, expired and disabled alerts", () => {
    const summary = summarizeWatched(
      [
        alert({ id: "p", pair: "EURUSD", alert_type: "price" }),
        alert({ id: "t", pair: "EURUSD", alert_type: "prev_day_level", status: "triggered" }),
        alert({ id: "e", pair: "EURUSD", alert_type: "sweep_confirm", status: "expired" }),
        alert({ id: "x", pair: "EURUSD", alert_type: "sweep_confirm", status: "disabled" }),
      ],
      ["EURUSD"],
    );
    expect(summary.pairs).toEqual([]);
    expect(summary.unwatchedFavorites).toEqual(["EUR/USD"]);
  });

  it("keeps watched pairs that are no longer favorites", () => {
    const summary = summarizeWatched(
      [alert({ id: "a", pair: "AUDUSD", alert_type: "prev_day_level" })],
      [],
    );
    expect(summary.pairs).toHaveLength(1);
    expect(summary.pairs[0].isFavorite).toBe(false);
  });

  it("handles empty inputs", () => {
    expect(summarizeWatched([], [])).toEqual({ pairs: [], unwatchedFavorites: [] });
  });
});

describe("collectWatchAlertIds", () => {
  const summary = summarizeWatched(
    [
      alert({ id: "a", pair: "EURUSD", alert_type: "prev_day_level" }),
      alert({ id: "b", pair: "EUR/USD", alert_type: "structure_session" }),
      alert({ id: "c", pair: "EURUSD", alert_type: "sweep_confirm", status: "waiting" }),
      alert({ id: "d", pair: "EURUSD", alert_type: "hour_sweep_cisd" }),
      alert({ id: "e", pair: "GBPUSD", alert_type: "prev_day_level" }),
      alert({ id: "f", pair: "AUDUSD", alert_type: "prev_day_level" }),
      alert({ id: "p", pair: "EURUSD", alert_type: "price" }),
      alert({ id: "t", pair: "EURUSD", alert_type: "prev_day_level", status: "triggered" }),
    ],
    ["EURUSD", "GBPUSD"],
  );

  it("returns every watch type for the selected pairs only", () => {
    expect(collectWatchAlertIds(summary, ["EURUSD"]).sort()).toEqual(["a", "b", "c", "d"]);
    expect(collectWatchAlertIds(summary, ["eur/usd", "GBPUSD"]).sort()).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
    ]);
  });

  it("excludes non-watch and non-active alerts", () => {
    const ids = collectWatchAlertIds(summary, ["EURUSD"]);
    expect(ids).not.toContain("p");
    expect(ids).not.toContain("t");
  });

  it("includes watched pairs that are not favorites", () => {
    expect(collectWatchAlertIds(summary, ["AUDUSD"])).toEqual(["f"]);
  });

  it("de-duplicates and ignores unknown or empty keys", () => {
    expect(collectWatchAlertIds(summary, ["EURUSD", "EUR/USD", "", "XXXYYY"]).sort()).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
    expect(collectWatchAlertIds(summary, [])).toEqual([]);
  });
});
