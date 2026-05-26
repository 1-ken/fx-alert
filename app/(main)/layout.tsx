"use client";

import React from "react";
import { useSession } from "next-auth/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Suspense } from "react";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { GlobalCreateAlertFab } from "@/components/global-create-alert-fab";
import { OfflineSyncBanner } from "@/components/offline-sync-banner";
import { TopNav } from "@/components/top-nav";
import { useBootstrap } from "@/components/bootstrap-provider";
import { TriggeredNotificationListener } from "@/components/triggered-notification-listener";
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

function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { bootstrap, error, isBootstrapBlocking, refetch } = useBootstrap();
  const shouldRedirectToOnboarding =
    bootstrap?.isFirstTimeUser === true && !bootstrap.onboardingCompletedAt;
  const isOnboardingPage = pathname === "/onboarding";

  useEffect(() => {
    if (isBootstrapBlocking) {
      return;
    }

    if (!bootstrap) {
      return;
    }

    if (shouldRedirectToOnboarding && !isOnboardingPage) {
      router.replace("/onboarding");
      return;
    }

    if (!shouldRedirectToOnboarding && isOnboardingPage) {
      router.replace("/dashboard");
    }
  }, [
    bootstrap,
    isBootstrapBlocking,
    isOnboardingPage,
    pathname,
    router,
    shouldRedirectToOnboarding,
  ]);

  if (isBootstrapBlocking) {
    return (
      <div className="flex min-h-[calc(100svh-4rem)] items-center justify-center px-4">
        <div className="text-center">
          <Spinner className="mx-auto size-4" />
          <p className="mt-4 text-sm text-muted-foreground">Checking account status...</p>
        </div>
      </div>
    );
  }

  if (error && !bootstrap) {
    return (
      <div className="flex min-h-[calc(100svh-4rem)] items-center justify-center px-4">
        <div className="max-w-sm space-y-3 text-center">
          <p className="text-sm text-destructive">Could not load account status.</p>
          <p className="text-xs text-muted-foreground">{error.message}</p>
          <Button type="button" variant="outline" onClick={() => void refetch()}>
            Retry
          </Button>
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
    if (status === "loading" && !session) {
      return;
    }

    if (!session && isOnline) {
      router.push("/login");
    }
  }, [isOnline, session, status, router]);

  if (status === "loading" && !session) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <Spinner className="mx-auto size-4" />
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!session && isOnline) {
    return null;
  }

  return (
    <OnboardingGuard>
      <StreamAlertsProvider>
        <TriggeredNotificationListener />
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
