"use client";

import { useContext } from "react";
import { ProductTourContext } from "@/components/product-tour/tour-provider";

/**
 * Access product tour controls (start, next, skip) from any client component.
 *
 * @returns Tour context value with navigation helpers and active state.
 * @throws When used outside `ProductTourProvider`.
 */
export function useProductTour() {
  const context = useContext(ProductTourContext);

  if (!context) {
    throw new Error("useProductTour must be used within ProductTourProvider");
  }

  return context;
}
