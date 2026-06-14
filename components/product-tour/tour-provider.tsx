"use client";

import React, {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { TourOverlay } from "@/components/product-tour/tour-overlay";
import {
  TOUR_COMPLETED_STORAGE_KEY,
  TOUR_STEPS,
  resolveTourTarget,
  type TourStep,
} from "@/components/product-tour/tour-steps";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { useBootstrap } from "@/components/bootstrap-provider";
import { completeTour } from "@/lib/api/bootstrap";
import { isTourMobileViewport } from "@/components/product-tour/tour-layout";

const TARGET_POLL_TIMEOUT_MS = 3000;
const TARGET_POLL_INTERVAL_MS = 50;

export interface ProductTourContextValue {
  isActive: boolean;
  currentStepIndex: number;
  currentStep: TourStep | null;
  totalSteps: number;
  startTour: (options?: { source?: "post-onboarding" | "manual" }) => void;
  next: () => void;
  prev: () => void;
  skip: () => void;
  complete: () => void;
}

export const ProductTourContext = createContext<ProductTourContextValue | null>(null);

interface ProductTourProviderProps {
  children: ReactNode;
}

/**
 * Polls the DOM until a tour target element appears or the timeout elapses.
 *
 * @param targetId - `data-tour` attribute value to locate.
 * @returns The matched element or null when not found in time.
 */
async function waitForTourTarget(targetId: string | undefined): Promise<Element | null> {
  if (!targetId) {
    return null;
  }

  const deadline = Date.now() + TARGET_POLL_TIMEOUT_MS;

  return new Promise((resolve) => {
    const poll = () => {
      const element = document.querySelector(`[data-tour="${targetId}"]`);
      if (element) {
        resolve(element);
        return;
      }

      if (Date.now() >= deadline) {
        resolve(null);
        return;
      }

      window.setTimeout(poll, TARGET_POLL_INTERVAL_MS);
    };

    poll();
  });
}

/**
 * Provides product tour state and renders the spotlight overlay when active.
 */
export function ProductTourProvider({ children }: ProductTourProviderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session } = useSession();
  const { bootstrap, refetch, isBootstrapBlocking } = useBootstrap();
  const [isActive, setIsActive] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [isStepReady, setIsStepReady] = useState(false);
  const navigatingRef = useRef(false);
  const autoTourStartedRef = useRef(false);

  const currentStep = isActive ? (TOUR_STEPS[currentStepIndex] ?? null) : null;

  const updateTargetRect = useCallback((step: TourStep) => {
    const targetId = resolveTourTarget(step);
    if (!targetId) {
      setTargetRect(null);
      return;
    }

    const element = document.querySelector(`[data-tour="${targetId}"]`);
    if (!element) {
      setTargetRect(null);
      return;
    }

    element.scrollIntoView({
      block: isTourMobileViewport() ? "center" : "nearest",
      behavior: isTourMobileViewport() ? "smooth" : "auto",
    });
    setTargetRect(element.getBoundingClientRect());
  }, []);

  const finishTour = useCallback(
    (options?: { redirectToDashboard?: boolean }) => {
      setIsActive(false);
      setCurrentStepIndex(0);
      setTargetRect(null);
      setIsStepReady(false);

      if (typeof window !== "undefined") {
        window.localStorage.setItem(TOUR_COMPLETED_STORAGE_KEY, "1");
      }

      const wasLegacyIntro = bootstrap?.requiresPricingIntro === true;

      void (async () => {
        await completeTour(session);
        await refetch();
        if (wasLegacyIntro) {
          toast.success(
            "Your 14-day free trial has started — 10 SMS and 5 calls per day included.",
            { duration: 6000 },
          );
        }
      })();

      if (options?.redirectToDashboard && pathname !== "/dashboard") {
        router.push("/dashboard");
      }
    },
    [bootstrap?.requiresPricingIntro, pathname, refetch, router, session],
  );

  const startTour = useCallback(
    (options?: { source?: "post-onboarding" | "manual" }) => {
      void options;
      setIsStepReady(false);
      setCurrentStepIndex(0);
      setIsActive(true);
    },
    [],
  );

  const next = useCallback(() => {
    if (currentStepIndex >= TOUR_STEPS.length - 1) {
      finishTour({ redirectToDashboard: true });
      return;
    }

    setIsStepReady(false);
    setCurrentStepIndex((prev) => prev + 1);
  }, [currentStepIndex, finishTour]);

  const prev = useCallback(() => {
    if (currentStepIndex <= 0) {
      return;
    }

    setIsStepReady(false);
    setCurrentStepIndex((prev) => prev - 1);
  }, [currentStepIndex]);

  const skip = useCallback(() => {
    finishTour();
  }, [finishTour]);

  const complete = useCallback(() => {
    finishTour({ redirectToDashboard: true });
  }, [finishTour]);

  useEffect(() => {
    if (!isActive || !currentStep) {
      return;
    }

    let cancelled = false;

    const prepareCurrentStep = async () => {
      if (currentStep.route && pathname !== currentStep.route) {
        navigatingRef.current = true;
        router.push(currentStep.route);
        return;
      }

      const targetId = resolveTourTarget(currentStep);
      if (targetId) {
        await waitForTourTarget(targetId);
      }

      if (cancelled) {
        return;
      }

      requestAnimationFrame(() => {
        if (!cancelled) {
          updateTargetRect(currentStep);
          setIsStepReady(true);
          navigatingRef.current = false;
        }
      });
    };

    void prepareCurrentStep();

    return () => {
      cancelled = true;
    };
  }, [currentStep, isActive, pathname, router, updateTargetRect]);

  useEffect(() => {
    if (!isActive || !currentStep) {
      return;
    }

    const handleLayoutChange = () => {
      updateTargetRect(currentStep);
    };

    window.addEventListener("resize", handleLayoutChange);
    window.addEventListener("scroll", handleLayoutChange, true);

    return () => {
      window.removeEventListener("resize", handleLayoutChange);
      window.removeEventListener("scroll", handleLayoutChange, true);
    };
  }, [currentStep, isActive, updateTargetRect]);

  useEffect(() => {
    if (!isActive) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        skip();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isActive, skip]);

  useEffect(() => {
    if (
      autoTourStartedRef.current ||
      isBootstrapBlocking ||
      !bootstrap ||
      typeof window === "undefined"
    ) {
      return;
    }

    const tourCompletedLocally =
      window.localStorage.getItem(TOUR_COMPLETED_STORAGE_KEY) === "1";
    const shouldAutoStartTour =
      Boolean(bootstrap.onboardingCompletedAt) &&
      !bootstrap.tourCompletedAt &&
      !tourCompletedLocally;

    if (!shouldAutoStartTour) {
      return;
    }

    autoTourStartedRef.current = true;
    window.setTimeout(() => {
      startTour({ source: "post-onboarding" });
    }, 0);
  }, [bootstrap, isBootstrapBlocking, startTour]);

  const value = useMemo<ProductTourContextValue>(
    () => ({
      isActive,
      currentStepIndex,
      currentStep,
      totalSteps: TOUR_STEPS.length,
      startTour,
      next,
      prev,
      skip,
      complete,
    }),
    [complete, currentStep, currentStepIndex, isActive, next, prev, skip, startTour],
  );

  return (
    <ProductTourContext.Provider value={value}>
      {children}
      {isActive && currentStep && isStepReady ? (
        <TourOverlay
          step={currentStep}
          stepIndex={currentStepIndex}
          totalSteps={TOUR_STEPS.length}
          targetRect={targetRect}
          onNext={next}
          onPrev={prev}
          onSkip={skip}
        />
      ) : null}
    </ProductTourContext.Provider>
  );
}
