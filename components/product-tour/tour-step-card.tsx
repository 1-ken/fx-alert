"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { TourStep } from "@/components/product-tour/tour-steps";

interface TourStepCardProps {
  step: TourStep;
  stepIndex: number;
  totalSteps: number;
  isLastStep: boolean;
  layoutMode: "anchored" | "bottomSheet" | "centered";
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
}

/**
 * Shared step card UI for anchored, centered, and bottom-sheet tour layouts.
 */
export function TourStepCard({
  step,
  stepIndex,
  totalSteps,
  isLastStep,
  layoutMode,
  onNext,
  onPrev,
  onSkip,
}: TourStepCardProps) {
  const progress = ((stepIndex + 1) / totalSteps) * 100;
  const isBottomSheet = layoutMode === "bottomSheet";

  return (
    <Card
      className={cn(
        "gap-4 border-border/80 bg-card shadow-2xl",
        isBottomSheet ? "rounded-t-xl rounded-b-none border-b-0 py-4" : "py-5",
      )}
    >
      {isBottomSheet ? (
        <div
          className="mx-auto mb-1 h-1.5 w-[100px] shrink-0 rounded-full bg-muted"
          aria-hidden="true"
        />
      ) : null}
      <CardHeader className={cn("pb-0", isBottomSheet ? "px-4 pt-0" : "px-5")}>
        <CardTitle id={`tour-step-title-${step.id}`} className="text-lg">
          {step.title}
        </CardTitle>
      </CardHeader>
      <CardContent
        className={cn(
          isBottomSheet && "max-h-[30vh] overflow-y-auto overscroll-contain px-4",
          !isBottomSheet && "px-5",
        )}
      >
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
      <CardFooter
        className={cn(
          "pt-0",
          isBottomSheet ? "flex-col-reverse gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]" : "flex items-center justify-between gap-2 px-5",
          !isBottomSheet && "max-[360px]:flex-col-reverse max-[360px]:items-stretch",
        )}
      >
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="product-tour-action text-muted-foreground max-[360px]:w-full"
          onClick={onSkip}
        >
          Skip tour
        </Button>
        <div
          className={cn(
            "flex items-center gap-2",
            isBottomSheet ? "w-full flex-col-reverse" : "max-[360px]:w-full max-[360px]:flex-col-reverse",
          )}
        >
          {stepIndex > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="product-tour-action max-[360px]:w-full"
              onClick={onPrev}
            >
              Back
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            className="product-tour-action max-[360px]:w-full"
            onClick={onNext}
          >
            {isLastStep ? "Finish" : "Next"}
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
