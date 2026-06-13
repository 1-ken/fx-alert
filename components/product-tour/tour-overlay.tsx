"use client";

import React, { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { TourPlacement, TourStep } from "@/components/product-tour/tour-steps";

const SPOTLIGHT_PADDING = 8;
const CARD_GAP = 16;
const VIEWPORT_MARGIN = 16;
const MOBILE_BREAKPOINT = 767;

interface TourOverlayProps {
  step: TourStep;
  stepIndex: number;
  totalSteps: number;
  targetRect: DOMRect | null;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
}

interface CardPosition {
  top: number;
  left: number;
  maxWidth: number;
  width?: number;
}

/**
 * Returns whether the current viewport should use mobile tour card layout.
 */
function isMobileViewport(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches;
}

/**
 * Pins the step card to the upper viewport so bottom FAB targets stay visible.
 *
 * @returns Pixel coordinates and width for a full-width upper card.
 */
function computeViewportUpperPosition(): CardPosition {
  const viewportWidth = window.innerWidth;
  const cardWidth = viewportWidth - VIEWPORT_MARGIN * 2;

  return {
    top: Math.max(VIEWPORT_MARGIN, 12),
    left: VIEWPORT_MARGIN,
    maxWidth: cardWidth,
    width: cardWidth,
  };
}

/**
 * Applies full-width horizontal margins for mobile anchored cards.
 *
 * @param position - Computed card position to normalize.
 * @returns Position with mobile-safe left and width values.
 */
function applyMobileFullWidth(position: CardPosition): CardPosition {
  if (!isMobileViewport()) {
    return position;
  }

  const viewportWidth = window.innerWidth;
  const cardWidth = viewportWidth - VIEWPORT_MARGIN * 2;

  return {
    ...position,
    left: VIEWPORT_MARGIN,
    maxWidth: cardWidth,
    width: cardWidth,
  };
}

/**
 * Chooses card placement based on available viewport space around the target.
 *
 * @param rect - Bounding rect of the highlighted element.
 * @param preferred - Step's preferred placement when space allows.
 * @param cardWidth - Estimated card width for collision checks.
 * @param cardHeight - Estimated card height for collision checks.
 * @returns Pixel coordinates for the step card.
 */
function computeCardPosition(
  rect: DOMRect,
  preferred: TourPlacement,
  cardWidth: number,
  cardHeight: number,
): CardPosition {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  const spaceAbove = rect.top;
  const spaceBelow = viewportHeight - rect.bottom;
  const spaceLeft = rect.left;
  const spaceRight = viewportWidth - rect.right;
  const isBottomTarget = rect.bottom > viewportHeight * 0.6;

  let placement = preferred;

  if (placement === "bottom" && spaceBelow < cardHeight + CARD_GAP) {
    placement = spaceAbove > spaceBelow ? "top" : "bottom";
  } else if (placement === "top" && spaceAbove < cardHeight + CARD_GAP) {
    placement = spaceBelow > spaceAbove ? "bottom" : "top";
  }

  let top = VIEWPORT_MARGIN;
  let left = VIEWPORT_MARGIN;
  const maxWidth = Math.min(360, viewportWidth - VIEWPORT_MARGIN * 2);

  if (placement === "bottom") {
    top = rect.bottom + CARD_GAP;
    left = Math.min(
      Math.max(rect.left + rect.width / 2 - cardWidth / 2, VIEWPORT_MARGIN),
      viewportWidth - cardWidth - VIEWPORT_MARGIN,
    );
  } else if (placement === "top") {
    const aboveTargetTop = rect.top - cardHeight - CARD_GAP;
    // Keep cards for bottom-fixed targets out of the lower half of the screen.
    top = isBottomTarget
      ? Math.min(Math.max(aboveTargetTop, VIEWPORT_MARGIN), viewportHeight * 0.35)
      : Math.max(aboveTargetTop, VIEWPORT_MARGIN);
    left = Math.min(
      Math.max(rect.left + rect.width / 2 - cardWidth / 2, VIEWPORT_MARGIN),
      viewportWidth - cardWidth - VIEWPORT_MARGIN,
    );
  } else if (placement === "left" && spaceLeft >= cardWidth + CARD_GAP) {
    top = Math.min(
      Math.max(rect.top, VIEWPORT_MARGIN),
      viewportHeight - cardHeight - VIEWPORT_MARGIN,
    );
    left = rect.left - cardWidth - CARD_GAP;
  } else if (placement === "right" && spaceRight >= cardWidth + CARD_GAP) {
    top = Math.min(
      Math.max(rect.top, VIEWPORT_MARGIN),
      viewportHeight - cardHeight - VIEWPORT_MARGIN,
    );
    left = rect.right + CARD_GAP;
  } else {
    top = rect.bottom + CARD_GAP;
    left = Math.min(
      Math.max(rect.left, VIEWPORT_MARGIN),
      viewportWidth - cardWidth - VIEWPORT_MARGIN,
    );
  }

  return { top, left, maxWidth };
}

/**
 * Renders the dimmed spotlight overlay and positioned step card for the active tour step.
 */
export function TourOverlay({
  step,
  stepIndex,
  totalSteps,
  targetRect,
  onNext,
  onPrev,
  onSkip,
}: TourOverlayProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const isCentered = !step.target || !targetRect;
  const isLastStep = stepIndex >= totalSteps - 1;
  const progress = ((stepIndex + 1) / totalSteps) * 100;
  const isViewportUpper = step.cardAnchor === "viewportUpper";
  const isClickableStep =
    step.id === "dashboard-pair-card" ||
    step.target === "dashboard-pair-card" ||
    step.target === "pair-create-alert-fab";

  const spotlightRect = useMemo(() => {
    if (!targetRect) {
      return null;
    }

    return {
      x: Math.max(targetRect.left - SPOTLIGHT_PADDING, 0),
      y: Math.max(targetRect.top - SPOTLIGHT_PADDING, 0),
      width: targetRect.width + SPOTLIGHT_PADDING * 2,
      height: targetRect.height + SPOTLIGHT_PADDING * 2,
      rx: 12,
    };
  }, [targetRect]);

  const cardStyle = useMemo<React.CSSProperties>(() => {
    if (isCentered) {
      return {
        maxWidth: "min(360px, calc(100vw - 2rem))",
      };
    }

    if (!targetRect) {
      return {};
    }

    const estimatedWidth = 320;
    const estimatedHeight = 240;
    const position = isViewportUpper
      ? computeViewportUpperPosition()
      : applyMobileFullWidth(
          computeCardPosition(
            targetRect,
            step.placement ?? "bottom",
            estimatedWidth,
            estimatedHeight,
          ),
        );

    return {
      top: position.top,
      left: position.left,
      maxWidth: position.maxWidth,
      width: position.width,
    };
  }, [isCentered, isViewportUpper, step.placement, targetRect]);

  useEffect(() => {
    const focusable = cardRef.current?.querySelector<HTMLElement>("button, [href]");
    focusable?.focus();
  }, [step.id]);

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="product-tour-root" role="presentation">
      <svg
        className={cn(
          "product-tour-spotlight",
          isClickableStep && spotlightRect && "product-tour-spotlight--clickable",
        )}
        aria-hidden="true"
        width="100%"
        height="100%"
      >
        <defs>
          <mask id="product-tour-mask">
            <rect width="100%" height="100%" fill="white" />
            {spotlightRect ? (
              <rect
                x={spotlightRect.x}
                y={spotlightRect.y}
                width={spotlightRect.width}
                height={spotlightRect.height}
                rx={spotlightRect.rx}
                fill="black"
              />
            ) : null}
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          className="product-tour-scrim"
          mask="url(#product-tour-mask)"
        />
        {spotlightRect && isClickableStep ? (
          <rect
            x={spotlightRect.x}
            y={spotlightRect.y}
            width={spotlightRect.width}
            height={spotlightRect.height}
            rx={spotlightRect.rx}
            fill="none"
            className="product-tour-spotlight-ring"
          />
        ) : null}
      </svg>

      <div
        key={step.id}
        ref={cardRef}
        className={cn(
          "product-tour-card fixed z-[61]",
          isCentered && "product-tour-card--centered",
          isViewportUpper && "product-tour-card--viewport-upper",
        )}
        style={cardStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`tour-step-title-${step.id}`}
      >
        <Card className="gap-4 border-border/80 bg-card py-5 shadow-2xl">
          <CardHeader className="px-5 pb-0">
            <CardTitle id={`tour-step-title-${step.id}`} className="text-lg">
              {step.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5">
            <p className="text-sm leading-relaxed text-muted-foreground">{step.body}</p>
            <div className="mt-4 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  Step {stepIndex + 1} of {totalSteps}
                </span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="product-tour-progress h-full rounded-full bg-primary"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex items-center justify-between gap-2 px-5 pt-0">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={onSkip}
            >
              Skip tour
            </Button>
            <div className="flex items-center gap-2">
              {stepIndex > 0 ? (
                <Button type="button" variant="outline" size="sm" onClick={onPrev}>
                  Back
                </Button>
              ) : null}
              <Button type="button" size="sm" onClick={onNext}>
                {isLastStep ? "Finish" : "Next"}
              </Button>
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>,
    document.body,
  );
}
