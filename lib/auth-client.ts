import { signOut } from "next-auth/react";
import { getFirebaseAuth, isFirebaseConfigured } from "@/lib/firebase-client";
import { signOut as firebaseSignOut } from "firebase/auth";

/**
 * Signs out of NextAuth and Firebase (when configured).
 */
export async function logoutUser(callbackUrl = "/login"): Promise<void> {
  if (isFirebaseConfigured()) {
    try {
      const auth = getFirebaseAuth();
      if (auth.currentUser) {
        await firebaseSignOut(auth).catch(() => undefined);
      }
    } catch {
      // Firebase may not be initialized.
    }
  }

  await signOut({ callbackUrl });
}
