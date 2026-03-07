import { NextResponse } from "next/server";
import { getApiUrl, API_ENDPOINTS } from "@/lib/constants";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { mfa_token } = body as { mfa_token?: string };

    if (!mfa_token) {
      return NextResponse.json(
        { message: "mfa_token is required" },
        { status: 400 }
      );
    }

    const resendUrl = getApiUrl(API_ENDPOINTS.AUTH.RESEND_OTP);
    const response = await fetch(resendUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mfa_token }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return NextResponse.json(
        { message: (data as { message?: string }).message || "Failed to resend code" },
        { status: response.status }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Resend OTP error:", error);
    return NextResponse.json(
      { message: "An error occurred while resending the code" },
      { status: 500 }
    );
  }
}
