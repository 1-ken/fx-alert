import { NextResponse } from "next/server";
import { getApiUrl, API_ENDPOINTS } from "@/lib/constants";
import { setOneTimeToken } from "@/lib/auth-cache";

const ACCESS_TOKEN_EXPIRY = 60 * 60 * 1000; // 1 hour
const REFRESH_TOKEN_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7 days

interface VerifyOtpResponse {
  status?: string;
  message?: string;
  access_token?: string;
  refresh_token?: string;
  user?: {
    id: string;
    name: string;
    phone: string;
    role: { id: string; name: string; rank: string };
    branch: { id: string; name: string; county_code: string };
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { mfa_token, otp_code } = body as { mfa_token?: string; otp_code?: string };

    if (!mfa_token || !otp_code) {
      return NextResponse.json(
        { message: "mfa_token and otp_code are required" },
        { status: 400 }
      );
    }

    const verifyUrl = getApiUrl(API_ENDPOINTS.AUTH.VERIFY_OTP);
    const response = await fetch(verifyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mfa_token, otp_code }),
    });

    const data: VerifyOtpResponse = await response.json().catch(() => ({}));

    if (!response.ok) {
      return NextResponse.json(
        { message: (data as { message?: string }).message || "Verification failed" },
        { status: response.status }
      );
    }

    if (data.status !== "authenticated" || !data.access_token || !data.user) {
      return NextResponse.json(
        { message: data.message || "Verification failed" },
        { status: 400 }
      );
    }

    const now = Date.now();
    const oneTimeToken = setOneTimeToken({
      user: data.user,
      accessToken: data.access_token,
      refreshToken: data.refresh_token!,
      accessTokenExpiresAt: now + ACCESS_TOKEN_EXPIRY,
      refreshTokenExpiresAt: now + REFRESH_TOKEN_EXPIRY,
    });

    return NextResponse.json({ oneTimeToken });
  } catch (error) {
    console.error("Verify OTP error:", error);
    return NextResponse.json(
      { message: "An error occurred during verification" },
      { status: 500 }
    );
  }
}
