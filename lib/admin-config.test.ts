import { describe, expect, it, vi, afterEach } from "vitest";
import {
  getAdminPanelPath,
  getDefaultAdminPhone,
  normalizeAdminPhone,
} from "@/lib/admin-config";

describe("getAdminPanelPath", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns null when secret is unset", () => {
    vi.stubEnv("NEXT_PUBLIC_ADMIN_PATH_SECRET", "");
    expect(getAdminPanelPath()).toBeNull();
  });

  it("returns path when secret is set", () => {
    vi.stubEnv("NEXT_PUBLIC_ADMIN_PATH_SECRET", "fx-admin");
    expect(getAdminPanelPath()).toBe("/admin/fx-admin");
  });
});

describe("getDefaultAdminPhone", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses env phone when configured", () => {
    vi.stubEnv("NEXT_PUBLIC_ADMIN_PHONE", "+254700000000");
    expect(getDefaultAdminPhone()).toBe("+254700000000");
  });

  it("falls back to default when unset", () => {
    vi.stubEnv("NEXT_PUBLIC_ADMIN_PHONE", "");
    expect(getDefaultAdminPhone()).toBe("+254707879716");
  });
});

describe("normalizeAdminPhone", () => {
  it("keeps digits and leading plus", () => {
    expect(normalizeAdminPhone("+254 707 879 716")).toBe("+254707879716");
    expect(normalizeAdminPhone("254707879716")).toBe("254707879716");
  });
});
