import { NextResponse } from "next/server";
import { validateApiAuth } from "@/lib/api-auth";
import { getResolvedObserverWsUrl } from "@/lib/observer-api";

export async function GET() {
  const auth = await validateApiAuth();
  if (!auth.authenticated) return auth.response;

  const wsUrl = await getResolvedObserverWsUrl();
  return NextResponse.json({ wsUrl });
}
