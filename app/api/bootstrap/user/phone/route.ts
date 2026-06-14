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

    const body = await request.text();
    const onlyIfEmpty = request.nextUrl.searchParams.get("only_if_empty");
    const query =
      onlyIfEmpty === "true" || onlyIfEmpty === "1" ? "?only_if_empty=true" : "";

    const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const response = await apiFetch(`${apiBaseUrl}/user/phone${query}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.accessToken || ""}`,
      },
      body,
      cache: "no-store",
    });

    const contentType = response.headers.get("content-type") ?? "application/json";
    const responseBody = await response.text();

    return new NextResponse(responseBody, {
      status: response.status,
      headers: {
        "Content-Type": contentType,
      },
    });
  } catch (error) {
    console.error("Failed to proxy /user/phone", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to save phone number.",
      },
      { status: 500 },
    );
  }
}
