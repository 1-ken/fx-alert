"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  SPOTLIGHT_PADDING,
  resolveCardLayout,
  type Size,
  type TourCardLayoutMode,
} from "@/components/product-tour/tour-layout";
import { TourStepCard } from "@/components/product-tour/tour-step-card";
import type { TourStep } from "@/components/product-tour/tour-steps";

interface TourOverlayProps {
  step: TourStep;
  stepIndex: number;
  totalSteps: number;
  targetRect: DOMRect | null;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
}

const DEFAULT_CARD_SIZE: Size = { width: 320, height: 240 };

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
  const lastMeasuredSizeRef = useRef<Size>(DEFAULT_CARD_SIZE);
  const isMobile = useIsMobile();
  const isLastStep = stepIndex >= totalSteps - 1;
  const [cardSize, setCardSize] = useState<Size>(DEFAULT_CARD_SIZE);
  const [layoutVersion, setLayoutVersion] = useState(0);

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

  const { mode: layoutMode, style: cardStyle } = useMemo(() => {
    void layoutVersion;

    return resolveCardLayout({
      step,
      targetRect,
      cardSize,
      isMobile,
    });
  }, [cardSize, isMobile, layoutVersion, step, targetRect]);

  useEffect(() => {
    lastMeasuredSizeRef.current = DEFAULT_CARD_SIZE;
    setCardSize(DEFAULT_CARD_SIZE);
    setLayoutVersion((version) => version + 1);
  }, [step.id]);

  useEffect(() => {
    const cardElement = cardRef.current;
    if (!cardElement) {
      return;
    }

    const measureCard = () => {
      const nextWidth = cardElement.offsetWidth || DEFAULT_CARD_SIZE.width;
      const nextHeight = cardElement.offsetHeight || DEFAULT_CARD_SIZE.height;
      const previous = lastMeasuredSizeRef.current;

      if (previous.width === nextWidth && previous.height === nextHeight) {
        return;
      }

      const nextSize = { width: nextWidth, height: nextHeight };
      lastMeasuredSizeRef.current = nextSize;
      setCardSize(nextSize);
      setLayoutVersion((version) => version + 1);
    };

    measureCard();

    const observer = new ResizeObserver(measureCard);
    observer.observe(cardElement);

    return () => observer.disconnect();
  }, [step.id, layoutMode]);

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
          layoutMode === "centered" && "product-tour-card--centered",
          layoutMode === "bottomSheet" && "product-tour-card--bottom-sheet",
          step.cardAnchor === "viewportUpper" &&
            layoutMode === "anchored" &&
            "product-tour-card--viewport-upper",
        )}
        style={cardStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`tour-step-title-${step.id}`}
      >
        <TourStepCard
          step={step}
          stepIndex={stepIndex}
          totalSteps={totalSteps}
          isLastStep={isLastStep}
          layoutMode={layoutMode as TourCardLayoutMode}
          onNext={onNext}
          onPrev={onPrev}
          onSkip={onSkip}
        />
      </div>
    </div>,
    document.body,
  );
}
