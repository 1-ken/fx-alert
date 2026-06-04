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
    let offlineTimer: number | null = null;

    const handleOnline = () => {
      setIsOnline(true);
      setShowBanner(false);
      if (offlineTimer !== null) {
        window.clearTimeout(offlineTimer);
        offlineTimer = null;
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      if (offlineTimer !== null) {
        window.clearTimeout(offlineTimer);
      }
      offlineTimer = window.setTimeout(() => {
        setShowBanner(true);
      }, 1500);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      if (offlineTimer !== null) {
        window.clearTimeout(offlineTimer);
      }
    };
  }, []);

  if (isOnline || !showBanner) {
    return null;
  }

  return (
    <div className="fixed left-1/2 top-3 z-50 -translate-x-1/2 rounded-full border bg-card px-4 py-2 text-xs font-medium text-foreground shadow-sm">
      You are offline. Return online to sync updates.
    </div>
  );
}
