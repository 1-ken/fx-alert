import { NextResponse } from "next/server";
import { getResolvedObserverWsUrl } from "@/lib/observer-api";

export async function GET() {
  const wsUrl = await getResolvedObserverWsUrl();
  return NextResponse.json({ wsUrl });
}
