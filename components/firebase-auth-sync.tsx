"use client";

import { useEffect, useRef } from "react";
import { signOut, useSession } from "next-auth/react";
import { FirebaseError } from "firebase/app";
import {
  signInWithCustomToken,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { toast } from "sonner";
import { ensureFirebaseAuthPersistence, firebaseAuth } from "@/lib/firebase-client";

export function FirebaseAuthSync() {
  const { data: session, status } = useSession();
  const lastSyncedUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const syncFirebaseUser = async () => {
      if (status === "loading") {
        return;
      }

      if (status !== "authenticated" || !session?.user?.id) {
        lastSyncedUserIdRef.current = null;

        if (firebaseAuth.currentUser) {
          await firebaseSignOut(firebaseAuth).catch(() => undefined);
        }

        return;
      }

      if (firebaseAuth.currentUser?.uid === session.user.id) {
        lastSyncedUserIdRef.current = session.user.id;
        return;
      }

      if (lastSyncedUserIdRef.current === session.user.id) {
        return;
      }

      try {
        await ensureFirebaseAuthPersistence();

        const response = await fetch("/api/firebase/custom-token", {
          method: "GET",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as
            | { error?: string; errorCode?: string }
            | null;

          if (payload?.errorCode === "auth/user-disabled") {
            await firebaseSignOut(firebaseAuth).catch(() => undefined);
            await signOut({ callbackUrl: "/login?error=disabled" });
            return;
          }

          throw new Error(payload?.error || "Unable to generate Firebase custom token.");
        }

        const payload = (await response.json()) as { firebaseCustomToken?: string };

        if (!payload.firebaseCustomToken) {
          throw new Error("Firebase custom token response was empty.");
        }

        await signInWithCustomToken(firebaseAuth, payload.firebaseCustomToken);

        if (!cancelled) {
          lastSyncedUserIdRef.current = session.user.id;
        }
      } catch (error) {
        console.error("Failed to sync Firebase Auth session", error);

        const message =
          error instanceof FirebaseError
            ? `Signed in, but Firebase sync failed: ${error.code}`
            : error instanceof Error
              ? `Signed in, but Firebase sync failed: ${error.message}`
              : "Signed in, but Firebase user sync failed.";

        if (!cancelled) {
          lastSyncedUserIdRef.current = null;
          toast.error(message);
        }
      }
    };

    void syncFirebaseUser();

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id, status]);

  return null;
}