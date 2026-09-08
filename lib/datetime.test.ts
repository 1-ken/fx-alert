import { describe, expect, it } from "vitest";
import { formatKenyaCompactDateTime } from "@/lib/datetime";

describe("formatKenyaCompactDateTime", () => {
  it("renders UTC timestamps in UTC+3", () => {
    const label = formatKenyaCompactDateTime("2026-03-12T09:05:00.000Z");
    expect(label).toMatch(/12 Mar 2026/);
    expect(label).toMatch(/12:05/);
  });

  it("returns an em dash for missing values", () => {
    expect(formatKenyaCompactDateTime(null)).toBe("—");
  });
});
