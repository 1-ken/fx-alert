import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getFirebaseAdminAuth, getFirebaseAdminDb } from "@/lib/firebase-admin";
import * as admin from "firebase-admin";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id || !session.user.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const auth = getFirebaseAdminAuth();
    const db = getFirebaseAdminDb();

    let firebaseUser;

    try {
      firebaseUser = await auth.getUser(session.user.id);
    } catch (error) {
      const errorCode =
        typeof error === "object" && error && "code" in error
          ? String(error.code)
          : "";

      if (errorCode !== "auth/user-not-found") {
        throw error;
      }

      firebaseUser = await auth.createUser({
        uid: session.user.id,
        email: session.user.email,
        displayName: session.user.name ?? undefined,
        photoURL: session.user.image ?? undefined,
      });
    }

    if (firebaseUser.disabled) {
      return NextResponse.json(
        {
          error: "This account is disabled. Contact the administrator.",
          errorCode: "auth/user-disabled",
        },
        { status: 403 },
      );
    }

    const userDocRef = db.collection("users").doc(session.user.id);
    const userDoc = await userDocRef.get();

    if (!userDoc.exists) {
      await userDocRef.set({
        uid: session.user.id,
        email: session.user.email,
        name: session.user.name ?? null,
        image: session.user.image ?? null,
        disabled: firebaseUser.disabled,
        provider: "google",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastLoginAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else {
      await userDocRef.set(
        {
          email: session.user.email,
          name: session.user.name ?? null,
          image: session.user.image ?? null,
          disabled: firebaseUser.disabled,
          provider: "google",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          lastLoginAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }

    const firebaseCustomToken = await auth.createCustomToken(
      session.user.id,
      {
        email: session.user.email,
      },
    );

    return NextResponse.json({ firebaseCustomToken });
  } catch (error) {
    console.error("Failed to create Firebase custom token", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create Firebase custom token.",
      },
      { status: 500 },
    );
  }
}
