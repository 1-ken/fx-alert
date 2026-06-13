import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { apiFetch } from "@/lib/api-fetch";

export async function POST() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const response = await apiFetch(`${apiBaseUrl}/subscription/dismiss-paywall`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.accessToken || ""}`,
      },
      cache: "no-store",
    });

    const contentType = response.headers.get("content-type") ?? "application/json";
    const body = await response.text();

    return new NextResponse(body, {
      status: response.status,
      headers: {
        "Content-Type": contentType,
      },
    });
  } catch (error) {
    console.error("Failed to proxy dismiss paywall", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to dismiss paywall.",
      },
      { status: 500 },
    );
  }
}
