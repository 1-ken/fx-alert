import { NextResponse } from "next/server";
import { validateApiAuth } from "@/lib/api-auth";
import { getResolvedObserverWsUrl } from "@/lib/observer-api";
import { resolveObserverAccessToken } from "@/lib/observer-access-token";

export async function GET() {
  const auth = await validateApiAuth();
  if (!auth.authenticated) return auth.response;

  const accessToken = await resolveObserverAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const wsUrl = await getResolvedObserverWsUrl(accessToken);
  return NextResponse.json({ wsUrl, accessToken });
}
