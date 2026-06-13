export const PENDING_TOUR_STORAGE_KEY = "fx-alert:pending-tour";
export const TOUR_COMPLETED_STORAGE_KEY = "fx-alert:tour-completed";

/** Demo pair route used during the chart alert creation tour step. */
export const TOUR_DEMO_PAIR_ROUTE = "/instruments/EURUSD";

export type TourPlacement = "top" | "bottom" | "left" | "right" | "center";

/** Where to pin the step card relative to the spotlight target. */
export type TourCardAnchor = "aboveTarget" | "viewportUpper";

/**
 * A single spotlight step in the product walkthrough.
 */
export interface TourStep {
  id: string;
  route?: string;
  target?: string;
  /** Responsive fallback when the primary target is hidden (e.g. mobile nav). */
  alternateTarget?: string;
  /** DOM fallback when the primary target is not yet mounted (e.g. loading grid). */
  fallbackTarget?: string;
  title: string;
  body: string;
  placement?: TourPlacement;
  /** Pins the step card to the upper viewport instead of beside the target. */
  cardAnchor?: TourCardAnchor;
}

/**
 * Five-step walkthrough: dashboard, pair chart alerts, settings phone, finish.
 */
export const TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    route: "/dashboard",
    title: "Welcome to FX Alert",
    body: "This quick tour covers live market monitoring, creating alerts from the chart, and setting your default phone number.",
    placement: "center",
  },
  {
    id: "dashboard-pair-card",
    route: "/dashboard",
    target: "dashboard-pair-card",
    fallbackTarget: "dashboard-grid",
    title: "Tap a pair card",
    body: "Each card is clickable. Tap any pair to open its live chart, view alerts, and create new ones. Notice the pointer cursor and hover state on the cards.",
    placement: "top",
  },
  {
    id: "pair-create-alert",
    route: TOUR_DEMO_PAIR_ROUTE,
    target: "pair-create-alert-fab",
    fallbackTarget: "pair-chart-alert",
    title: "Create Alert",
    body: "Tap Create Alert to open the full alert form for this pair. You can also click the chart or use the + button to set a price or candle-close alert at a specific level.",
    placement: "top",
    cardAnchor: "viewportUpper",
  },
  {
    id: "settings-phone",
    route: "/settings",
    target: "settings-default-phone",
    title: "Default phone number",
    body: "Set your default phone number here. It pre-fills when you create SMS or call alerts so you do not have to type it each time.",
    placement: "bottom",
  },
  {
    id: "finish",
    route: "/settings",
    title: "You're ready",
    body: "You know how to monitor pairs, create chart alerts, and configure your phone defaults. Happy trading!",
    placement: "center",
  },
];

/**
 * Resolves the DOM `data-tour` target for a step, accounting for responsive layouts.
 *
 * @param step - Tour step definition.
 * @returns The active target id or undefined for centered steps.
 */
export function resolveTourTarget(step: TourStep): string | undefined {
  if (!step.target) {
    return undefined;
  }

  if (typeof window !== "undefined") {
    const primary = document.querySelector(`[data-tour="${step.target}"]`);

    if (step.alternateTarget) {
      const isMobile = window.matchMedia("(max-width: 767px)").matches;
      const alternate = document.querySelector(`[data-tour="${step.alternateTarget}"]`);

      if (isMobile && alternate) {
        return step.alternateTarget;
      }

      if (!isMobile && primary) {
        return step.target;
      }

      if (alternate) {
        return step.alternateTarget;
      }
    }

    if (primary) {
      return step.target;
    }

    if (step.fallbackTarget) {
      const fallback = document.querySelector(`[data-tour="${step.fallbackTarget}"]`);
      if (fallback) {
        return step.fallbackTarget;
      }
    }
  }

  return step.fallbackTarget ?? step.target;
}
