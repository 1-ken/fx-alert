"use client";

import { MapIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProductTour } from "@/hooks/use-product-tour";

/**
 * Floating replay button that restarts the product walkthrough from the dashboard.
 */
export function TourFab() {
  const { isActive, startTour } = useProductTour();

  if (isActive) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed bottom-0 left-0 right-0 z-40">
      <div className="mx-auto flex w-full max-w-4xl justify-start px-4 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-6">
        <div className="pointer-events-auto">
          <Button
            type="button"
            size="lg"
            className="product-tour-fab product-tour-fab--attention flex h-auto items-center gap-3 rounded-full px-4 py-3 shadow-xl"
            aria-label="Start product tour"
            onClick={() => startTour({ source: "manual" })}
          >
            <MapIcon className="h-5 w-5" />
            <span>Tour</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
