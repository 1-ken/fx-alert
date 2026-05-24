"use client";

import React from "react";
import { useSession } from "next-auth/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Suspense } from "react";
import { Spinner } from "@/components/ui/spinner";
import { GlobalCreateAlertFab } from "@/components/global-create-alert-fab";
import { OfflineSyncBanner } from "@/components/offline-sync-banner";
import { TopNav } from "@/components/top-nav";
import { useBootstrap } from "@/components/bootstrap-provider";
import { AlertSoundListener } from "@/components/alert-sound-listener";
import { StreamAlertsProvider } from "@/components/stream-alerts-provider";

const LAST_ROUTE_STORAGE_KEY = "fx-alert:last-main-route";

function RoutePersistence({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hasRestoredRoute = useRef(false);

  const currentRoute = useMemo(() => {
    const query = searchParams.toString();
    return query ? `${pathname}?${query}` : pathname;
  }, [pathname, searchParams]);

  useEffect(() => {
    if (!enabled || hasRestoredRoute.current) {
      return;
    }

    const storedRoute = window.localStorage.getItem(LAST_ROUTE_STORAGE_KEY);
    hasRestoredRoute.current = true;

    if (storedRoute && storedRoute !== currentRoute) {
      router.replace(storedRoute);
    }
  }, [currentRoute, enabled, router]);

  useEffect(() => {
    if (!enabled || !hasRestoredRoute.current) {
      return;
    }

    window.localStorage.setItem(LAST_ROUTE_STORAGE_KEY, currentRoute);
  }, [currentRoute, enabled]);

  return null;
}

function OnboardingGuard({
  children,
  isInitialLoading,
}: {
  children: React.ReactNode;
  isInitialLoading: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { bootstrap, error } = useBootstrap();
  const shouldRedirectToOnboarding =
    bootstrap?.isFirstTimeUser === true && !bootstrap.onboardingCompletedAt;
  const isOnboardingPage = pathname === "/onboarding";

  useEffect(() => {
    console.log("[OnboardingGuard] State:", {
      isInitialLoading,
      bootstrapAvailable: !!bootstrap,
      pathname,
      error: error?.message,
      isFirstTimeUser: bootstrap?.isFirstTimeUser,
      onboardingCompletedAt: bootstrap?.onboardingCompletedAt,
      shouldRedirectToOnboarding,
    });

    if (isInitialLoading) {
      console.log("[OnboardingGuard] Waiting for bootstrap data...");
      return;
    }

    if (!bootstrap) {
      console.log("[OnboardingGuard] No bootstrap payload yet, waiting for backend decision");
      return;
    }

    if (shouldRedirectToOnboarding && !isOnboardingPage) {
      console.log("[OnboardingGuard] First-time user detected, redirecting to onboarding");
      router.replace("/onboarding");
      return;
    }

    if (!shouldRedirectToOnboarding && isOnboardingPage) {
      console.log("[OnboardingGuard] Returning user on onboarding page, redirecting to dashboard");
      router.replace("/dashboard");
    }
  }, [
    bootstrap,
    error,
    isInitialLoading,
    isOnboardingPage,
    pathname,
    router,
    shouldRedirectToOnboarding,
  ]);

  if (isInitialLoading || (!bootstrap && !error)) {
    return (
      <div className="flex min-h-[calc(100svh-4rem)] items-center justify-center px-4">
        <div className="text-center">
          <Spinner className="mx-auto size-4" />
          <p className="mt-4 text-sm text-muted-foreground">Checking account status...</p>
        </div>
      </div>
    );
  }

  if (shouldRedirectToOnboarding && !isOnboardingPage) {
    return (
      <div className="flex min-h-[calc(100svh-4rem)] items-center justify-center px-4">
        <div className="text-center">
          <Spinner className="mx-auto size-4" />
          <p className="mt-4 text-sm text-muted-foreground">Preparing onboarding...</p>
        </div>
      </div>
    );
  }

  if (!shouldRedirectToOnboarding && isOnboardingPage) {
    return (
      <div className="flex min-h-[calc(100svh-4rem)] items-center justify-center px-4">
        <div className="text-center">
          <Spinner className="mx-auto size-4" />
          <p className="mt-4 text-sm text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { isInitialLoading: bootstrapLoading } = useBootstrap();
  const [isOnline, setIsOnline] = useState(() => {
    if (typeof window === "undefined") {
      return true;
    }

    return window.navigator.onLine;
  });

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (status === "loading") return; // Still loading

    if (!session && isOnline) {
      router.push("/login");
      return;
    }
  }, [isOnline, session, status, router]);

  // Show loading while checking authentication
  if (status === "loading") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Spinner className="size-4 mx-auto" />
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Don't render anything if user is not authenticated
  if (!session && isOnline) {
    return null;
  }

  return (
    <OnboardingGuard isInitialLoading={bootstrapLoading}>
      <StreamAlertsProvider>
        <AlertSoundListener />
        <Suspense fallback={null}>
          <RoutePersistence enabled={status === "authenticated" || !isOnline} />
        </Suspense>
        <TopNav />
        <OfflineSyncBanner />
        <div className="pt-[max(env(safe-area-inset-top),0.75rem)] pb-24">{children}</div>
        <GlobalCreateAlertFab />
      </StreamAlertsProvider>
    </OnboardingGuard>
  );
}
