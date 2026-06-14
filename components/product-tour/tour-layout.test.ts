import { describe, expect, it } from "vitest";
import {
  BOTTOM_CHROME_HEIGHT,
  VIEWPORT_MARGIN,
  cardRectFromPosition,
  isTourMobileViewport,
  rectsOverlap,
  type Rect,
  type SafeViewport,
  wouldCollide,
} from "@/components/product-tour/tour-layout";

describe("isTourMobileViewport", () => {
  it("treats widths below 768px as mobile", () => {
    expect(isTourMobileViewport(375)).toBe(true);
    expect(isTourMobileViewport(767)).toBe(true);
    expect(isTourMobileViewport(768)).toBe(false);
  });
});

describe("rectsOverlap", () => {
  it("detects overlapping rectangles", () => {
    const a: Rect = { top: 0, left: 0, width: 100, height: 100 };
    const b: Rect = { top: 50, left: 50, width: 100, height: 100 };

    expect(rectsOverlap(a, b)).toBe(true);
  });

  it("returns false for separated rectangles", () => {
    const a: Rect = { top: 0, left: 0, width: 50, height: 50 };
    const b: Rect = { top: 100, left: 100, width: 50, height: 50 };

    expect(rectsOverlap(a, b)).toBe(false);
  });
});

describe("wouldCollide", () => {
  const viewport: SafeViewport = {
    top: VIEWPORT_MARGIN,
    left: VIEWPORT_MARGIN,
    width: 343,
    height: 500,
    bottomChrome: BOTTOM_CHROME_HEIGHT,
    safeTop: 0,
    safeBottom: 0,
  };

  it("flags cards that overlap the spotlight target", () => {
    const target: Rect = { top: 200, left: 16, width: 311, height: 140 };
    const card = cardRectFromPosition(
      { top: 210, left: 16, maxWidth: 311, width: 311 },
      { width: 311, height: 220 },
    );

    expect(wouldCollide(card, target, viewport)).toBe(true);
  });

  it("accepts cards placed above the target within the viewport", () => {
    const target: Rect = { top: 300, left: 16, width: 311, height: 140 };
    const card = cardRectFromPosition(
      { top: 40, left: 16, maxWidth: 311, width: 311 },
      { width: 311, height: 220 },
    );

    expect(wouldCollide(card, target, viewport)).toBe(false);
  });

  it("flags cards that extend below the safe viewport", () => {
    const card = cardRectFromPosition(
      { top: 400, left: 16, maxWidth: 311, width: 311 },
      { width: 311, height: 220 },
    );

    expect(wouldCollide(card, null, viewport)).toBe(true);
  });
});
