import type { CSSProperties } from "react";
import type { TourPlacement, TourStep } from "@/components/product-tour/tour-steps";

/** Breakpoint aligned with `hooks/use-mobile.ts`. */
export const TOUR_MOBILE_BREAKPOINT = 768;

export const SPOTLIGHT_PADDING = 8;
export const CARD_GAP = 16;
export const VIEWPORT_MARGIN = 16;
/** Matches FAB / bottom-nav padding: 5rem + safe-area. */
export const BOTTOM_CHROME_HEIGHT = 80;

export type TourCardLayoutMode = "anchored" | "bottomSheet" | "centered";

export interface Size {
  width: number;
  height: number;
}

export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface SafeViewport extends Rect {
  bottomChrome: number;
  safeTop: number;
  safeBottom: number;
}

export interface CardPosition {
  top: number;
  left: number;
  maxWidth: number;
  width?: number;
}

export interface TourCardLayout {
  mode: TourCardLayoutMode;
  style: CSSProperties;
}

/**
 * Returns whether the viewport width qualifies as mobile for tour layout.
 *
 * @param width - Viewport width in pixels; defaults to `window.innerWidth` when available.
 */
export function isTourMobileViewport(width?: number): boolean {
  const viewportWidth =
    width ?? (typeof window !== "undefined" ? window.innerWidth : TOUR_MOBILE_BREAKPOINT);

  return viewportWidth < TOUR_MOBILE_BREAKPOINT;
}

/**
 * Reads safe-area inset values from CSS env() when running in a browser.
 *
 * @returns Top and bottom safe-area inset heights in pixels.
 */
function readSafeAreaInsets(): { top: number; bottom: number } {
  if (typeof document === "undefined") {
    return { top: 0, bottom: 0 };
  }

  const probe = document.createElement("div");
  probe.style.position = "fixed";
  probe.style.visibility = "hidden";
  probe.style.paddingTop = "env(safe-area-inset-top)";
  probe.style.paddingBottom = "env(safe-area-inset-bottom)";
  document.body.appendChild(probe);

  const top = Number.parseFloat(getComputedStyle(probe).paddingTop) || 0;
  const bottom = Number.parseFloat(getComputedStyle(probe).paddingBottom) || 0;
  document.body.removeChild(probe);

  return { top, bottom };
}

/**
 * Returns the usable viewport rect excluding safe areas and bottom chrome.
 */
export function measureSafeViewport(): SafeViewport {
  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 360;
  const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 640;
  const { top: safeTop, bottom: safeBottom } = readSafeAreaInsets();
  const bottomChrome = BOTTOM_CHROME_HEIGHT + safeBottom;

  return {
    top: safeTop + VIEWPORT_MARGIN,
    left: VIEWPORT_MARGIN,
    width: viewportWidth - VIEWPORT_MARGIN * 2,
    height: viewportHeight - safeTop - bottomChrome - VIEWPORT_MARGIN,
    bottomChrome,
    safeTop,
    safeBottom,
  };
}

/**
 * Converts a DOMRect-like object into a plain rect for collision math.
 */
export function toRect(rect: DOMRect | Rect): Rect {
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

/**
 * Builds a card rect from a top-left position and measured card size.
 */
export function cardRectFromPosition(position: CardPosition, cardSize: Size): Rect {
  const width = position.width ?? Math.min(position.maxWidth, cardSize.width);

  return {
    top: position.top,
    left: position.left,
    width,
    height: cardSize.height,
  };
}

/**
 * Returns true when two rects overlap (with optional gap buffer).
 */
export function rectsOverlap(a: Rect, b: Rect, gap = 0): boolean {
  return !(
    a.left + a.width + gap <= b.left ||
    b.left + b.width + gap <= a.left ||
    a.top + a.height + gap <= b.top ||
    b.top + b.height + gap <= a.top
  );
}

/**
 * Returns true when a card rect extends outside the safe viewport or overlaps the target.
 */
export function wouldCollide(
  cardRect: Rect,
  targetRect: Rect | null,
  viewport: SafeViewport,
  spotlightPadding = SPOTLIGHT_PADDING,
): boolean {
  const viewportBounds: Rect = {
    top: viewport.top,
    left: viewport.left,
    width: viewport.width,
    height: viewport.height,
  };

  const withinViewport =
    cardRect.top >= viewportBounds.top &&
    cardRect.left >= viewportBounds.left &&
    cardRect.top + cardRect.height <= viewportBounds.top + viewportBounds.height &&
    cardRect.left + cardRect.width <= viewportBounds.left + viewportBounds.width;

  if (!withinViewport) {
    return true;
  }

  if (!targetRect) {
    return false;
  }

  const spotlight: Rect = {
    top: targetRect.top - spotlightPadding,
    left: targetRect.left - spotlightPadding,
    width: targetRect.width + spotlightPadding * 2,
    height: targetRect.height + spotlightPadding * 2,
  };

  return rectsOverlap(cardRect, spotlight, CARD_GAP);
}

/**
 * Pins the step card to the upper viewport so bottom FAB targets stay visible.
 */
export function computeViewportUpperPosition(viewport: SafeViewport, cardSize: Size): CardPosition {
  return {
    top: Math.max(viewport.top, viewport.safeTop + 12),
    left: VIEWPORT_MARGIN,
    maxWidth: viewport.width,
    width: viewport.width,
  };
}

/**
 * Chooses card placement based on available viewport space around the target.
 */
export function computeAnchoredPosition(
  targetRect: DOMRect,
  preferred: TourPlacement,
  cardSize: Size,
  viewport: SafeViewport,
): CardPosition | null {
  const windowWidth = viewport.width + VIEWPORT_MARGIN * 2;
  const windowHeight =
    typeof window !== "undefined"
      ? window.innerHeight
      : viewport.height + viewport.top + viewport.bottomChrome;
  const cardWidth = Math.min(
    isTourMobileViewport(windowWidth) ? viewport.width : 360,
    cardSize.width,
  );
  const cardHeight = cardSize.height;

  const spaceAbove = targetRect.top - viewport.top;
  const spaceBelow = windowHeight - targetRect.bottom - viewport.bottomChrome;
  const spaceLeft = targetRect.left - VIEWPORT_MARGIN;
  const spaceRight = windowWidth - targetRect.right - VIEWPORT_MARGIN;
  const isBottomTarget = targetRect.bottom > windowHeight * 0.6;

  let placement = preferred === "center" ? "bottom" : preferred;

  if (placement === "bottom" && spaceBelow < cardHeight + CARD_GAP) {
    placement = spaceAbove > spaceBelow ? "top" : "bottom";
  } else if (placement === "top" && spaceAbove < cardHeight + CARD_GAP) {
    placement = spaceBelow > spaceAbove ? "bottom" : "top";
  }

  let top = viewport.top;
  let left = VIEWPORT_MARGIN;
  const maxWidth = isTourMobileViewport(windowWidth)
    ? viewport.width
    : Math.min(360, viewport.width);

  if (placement === "bottom") {
    top = targetRect.bottom + CARD_GAP;
    left = Math.min(
      Math.max(targetRect.left + targetRect.width / 2 - cardWidth / 2, VIEWPORT_MARGIN),
      windowWidth - cardWidth - VIEWPORT_MARGIN,
    );
  } else if (placement === "top") {
    const aboveTargetTop = targetRect.top - cardHeight - CARD_GAP;
    top = isBottomTarget
      ? Math.min(Math.max(aboveTargetTop, viewport.top), windowHeight * 0.35)
      : Math.max(aboveTargetTop, viewport.top);
    left = Math.min(
      Math.max(targetRect.left + targetRect.width / 2 - cardWidth / 2, VIEWPORT_MARGIN),
      windowWidth - cardWidth - VIEWPORT_MARGIN,
    );
  } else if (placement === "left" && spaceLeft >= cardWidth + CARD_GAP) {
    top = Math.min(
      Math.max(targetRect.top, viewport.top),
      viewport.top + viewport.height - cardHeight,
    );
    left = targetRect.left - cardWidth - CARD_GAP;
  } else if (placement === "right" && spaceRight >= cardWidth + CARD_GAP) {
    top = Math.min(
      Math.max(targetRect.top, viewport.top),
      viewport.top + viewport.height - cardHeight,
    );
    left = targetRect.right + CARD_GAP;
  } else {
    top = targetRect.bottom + CARD_GAP;
    left = Math.min(
      Math.max(targetRect.left, VIEWPORT_MARGIN),
      windowWidth - cardWidth - VIEWPORT_MARGIN,
    );
  }

  const position: CardPosition = {
    top,
    left,
    maxWidth,
    width: isTourMobileViewport(windowWidth) ? viewport.width : undefined,
  };

  const cardRect = cardRectFromPosition(position, { width: cardWidth, height: cardHeight });

  if (wouldCollide(cardRect, toRect(targetRect), viewport)) {
    return null;
  }

  return position;
}

/**
 * Returns inline styles for a centered tour card when viewport height allows.
 */
function computeCenteredStyle(
  cardSize: Size,
  viewport: SafeViewport,
): CSSProperties | null {
  const maxCardHeight = viewport.height - VIEWPORT_MARGIN * 2;

  if (cardSize.height > maxCardHeight) {
    return null;
  }

  return {
    maxWidth: "min(360px, calc(100vw - 2rem))",
    maxHeight: `${maxCardHeight}px`,
  };
}

/**
 * Resolves the best card layout mode and inline styles for the active tour step.
 */
export function resolveCardLayout(options: {
  step: TourStep;
  targetRect: DOMRect | null;
  cardSize: Size;
  isMobile: boolean;
}): TourCardLayout {
  const { step, targetRect, cardSize, isMobile } = options;
  const viewport = measureSafeViewport();
  const isCentered = !step.target || !targetRect;
  const isViewportUpper = step.cardAnchor === "viewportUpper";

  if (isCentered) {
    const centeredStyle = computeCenteredStyle(cardSize, viewport);

    if (centeredStyle) {
      return { mode: "centered", style: centeredStyle };
    }

    return { mode: "bottomSheet", style: {} };
  }

  if (!targetRect) {
    return { mode: "bottomSheet", style: {} };
  }

  const target = toRect(targetRect);
  const placementCandidates: TourPlacement[] = [];

  if (isViewportUpper) {
    placementCandidates.push("top");
  } else {
    placementCandidates.push(step.placement ?? "bottom", "top", "bottom");
  }

  const seen = new Set<TourPlacement>();

  for (const placement of placementCandidates) {
    if (seen.has(placement)) {
      continue;
    }

    seen.add(placement);

    const position = isViewportUpper
      ? computeViewportUpperPosition(viewport, cardSize)
      : computeAnchoredPosition(targetRect, placement, cardSize, viewport);

    if (!position) {
      continue;
    }

    const cardRect = cardRectFromPosition(
      position,
      {
        width: position.width ?? position.maxWidth,
        height: cardSize.height,
      },
    );

    if (!wouldCollide(cardRect, target, viewport)) {
      return {
        mode: "anchored",
        style: {
          top: position.top,
          left: position.left,
          maxWidth: position.maxWidth,
          width: position.width,
        },
      };
    }
  }

  // On desktop, retry without mobile full-width constraint.
  if (!isMobile) {
    const fallback = computeAnchoredPosition(
      targetRect,
      step.placement ?? "bottom",
      cardSize,
      viewport,
    );

    if (fallback) {
      return {
        mode: "anchored",
        style: {
          top: fallback.top,
          left: fallback.left,
          maxWidth: fallback.maxWidth,
          width: fallback.width,
        },
      };
    }
  }

  return { mode: "bottomSheet", style: {} };
}
