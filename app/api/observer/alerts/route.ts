import { API_ENDPOINTS } from "@/lib/constants";
import { proxyObserverRequest } from "@/lib/observer-api";
import { validateApiAuth } from "@/lib/api-auth";

export async function GET() {
  const auth = await validateApiAuth();
  if (!auth.authenticated) return auth.response;

  return proxyObserverRequest(API_ENDPOINTS.ALERTS.LIST, {
    method: "GET",
  });
}

export async function POST(request: Request) {
  const auth = await validateApiAuth();
  if (!auth.authenticated) return auth.response;

  const body = await request.text();

  return proxyObserverRequest(API_ENDPOINTS.ALERTS.CREATE, {
    method: "POST",
    body,
  });
}
