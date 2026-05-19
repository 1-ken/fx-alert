import { NextRequest } from "next/server";
import { API_ENDPOINTS } from "@/lib/constants";
import { validateApiAuth } from "@/lib/api-auth";
import { proxyObserverRequest } from "@/lib/observer-api";
import { buildObserverEndpointWithQuery } from "@/lib/observer-proxy-query";

export async function GET(request: NextRequest) {
  const auth = await validateApiAuth();
  if (!auth.authenticated) return auth.response;

  return proxyObserverRequest(
    buildObserverEndpointWithQuery(API_ENDPOINTS.STREAMING.HISTORICAL_STREAM_METRICS, request)
  );
}
