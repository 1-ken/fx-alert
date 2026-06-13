"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";

import { clearReferralCode, readReferralCode } from "@/lib/referral";

/**
 * Claims a stored marketer referral after sign-in (credentials or Google OAuth).
 */
export function ReferralClaimer() {
  const { status } = useSession();
  const hasClaimedRef = useRef(false);

  useEffect(() => {
    if (status !== "authenticated" || hasClaimedRef.current) {
      return;
    }

    const marketerCode = readReferralCode();
    if (!marketerCode) {
      return;
    }

    hasClaimedRef.current = true;

    const claimReferral = async () => {
      try {
        await fetch("/api/auth/claim-referral", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ marketer_code: marketerCode }),
        });
      } catch {
        // Referral attribution is best-effort; do not block the app.
      } finally {
        clearReferralCode();
      }
    };

    void claimReferral();
  }, [status]);

  return null;
}
