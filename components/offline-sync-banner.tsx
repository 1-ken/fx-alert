"use client";

import { useEffect, useState } from "react";

export function OfflineSyncBanner() {
  const [isOnline, setIsOnline] = useState(() => {
    if (typeof window === "undefined") {
      return true;
    }

    return window.navigator.onLine;
  });
  const [showBanner, setShowBanner] = useState(false);

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
    if (isOnline) {
      setShowBanner(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setShowBanner(true);
    }, 1500);

    return () => {
      window.clearTimeout(timer);
    };
  }, [isOnline]);

  if (isOnline || !showBanner) {
    return null;
  }

  return (
    <div className="fixed left-1/2 top-3 z-50 -translate-x-1/2 rounded-full border bg-card px-4 py-2 text-xs font-medium text-foreground shadow-sm">
      You are offline. Return online to sync updates.
    </div>
  );
}
