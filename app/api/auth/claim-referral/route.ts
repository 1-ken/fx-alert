import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { apiFetch } from "@/lib/api-fetch";

function getApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
    }

    let body: { marketer_code?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ detail: "Invalid request body" }, { status: 400 });
    }

    const upstreamResponse = await apiFetch(
      `${getApiBaseUrl()}/api/v1/auth/claim-referral`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.accessToken || ""}`,
        },
        body: JSON.stringify({
          marketer_code: body.marketer_code?.trim() ?? "",
        }),
      },
    );

    const payload = await upstreamResponse.json().catch(() => ({
      detail: "Claim referral failed",
    }));

    return NextResponse.json(payload, { status: upstreamResponse.status });
  } catch (error) {
    console.error("Failed to proxy claim-referral", error);
    return NextResponse.json({ detail: "Claim referral failed" }, { status: 500 });
  }
}
