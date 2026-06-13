import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { apiFetch } from "@/lib/api-fetch";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await request.json();
    const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const response = await apiFetch(`${apiBaseUrl}/subscription/select-tier`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.accessToken || ""}`,
      },
      body: JSON.stringify(payload),
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
    console.error("Failed to proxy select tier", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to select subscription tier.",
      },
      { status: 500 },
    );
  }
}
