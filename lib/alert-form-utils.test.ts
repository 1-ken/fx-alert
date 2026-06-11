import { describe, expect, it } from "vitest";
import { shouldApplyInitialNotifyVia } from "@/lib/alert-form-utils";

describe("shouldApplyInitialNotifyVia", () => {
  it("applies only when not yet applied and channels are provided", () => {
    expect(shouldApplyInitialNotifyVia(false, ["sound"])).toBe(true);
    expect(shouldApplyInitialNotifyVia(true, ["sound"])).toBe(false);
    expect(shouldApplyInitialNotifyVia(false, [])).toBe(false);
    expect(shouldApplyInitialNotifyVia(false, undefined)).toBe(false);
  });

  it("ignores prop reference changes after first apply", () => {
    let applied = false;
    const first = ["sound"] as const;
    const second = ["sound"] as const;

    expect(shouldApplyInitialNotifyVia(applied, [...first])).toBe(true);
    applied = true;
    expect(shouldApplyInitialNotifyVia(applied, [...second])).toBe(false);
  });
});
