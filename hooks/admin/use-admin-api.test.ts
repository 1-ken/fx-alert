import { describe, expect, it } from "vitest";
import { toAdminProxyPath } from "@/hooks/admin/use-admin-api";

describe("toAdminProxyPath", () => {
  it("maps upstream admin paths to same-origin proxy", () => {
    expect(toAdminProxyPath("/api/v1/admin/metrics/extended")).toBe(
      "/api/admin/metrics/extended",
    );
    expect(toAdminProxyPath("/api/v1/admin/otp/request")).toBe("/api/admin/otp/request");
  });
});
