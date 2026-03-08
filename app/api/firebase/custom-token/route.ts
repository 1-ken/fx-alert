import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getFirebaseAdminAuth } from "@/lib/firebase-admin";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id || !session.user.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const firebaseCustomToken = await getFirebaseAdminAuth().createCustomToken(
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
