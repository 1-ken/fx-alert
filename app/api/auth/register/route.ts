import { NextResponse } from "next/server";

import { apiFetch } from "@/lib/api-fetch";

function getApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
}

export async function POST(request: Request) {
  let body: { username?: string; password?: string; marketer_code?: string };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ detail: "Invalid request body" }, { status: 400 });
  }

  const username = body.username?.trim();
  const password = body.password;
  const marketerCode = body.marketer_code?.trim();

  if (!username || !password) {
    return NextResponse.json(
      { detail: "Username and password are required" },
      { status: 400 }
    );
  }

  const payload: { username: string; password: string; marketer_code?: string } = {
    username,
    password,
  };
  if (marketerCode) {
    payload.marketer_code = marketerCode;
  }

  const upstreamResponse = await apiFetch(`${getApiBaseUrl()}/api/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const responsePayload = await upstreamResponse.json().catch(() => ({
    detail: "Registration failed",
  }));

  return NextResponse.json(responsePayload, { status: upstreamResponse.status });
}
