import { API_ENDPOINTS } from "@/lib/constants";
import { proxyObserverRequest } from "@/lib/observer-api";
import { validateApiAuth } from "@/lib/api-auth";

export async function GET() {
  const auth = await validateApiAuth();
  if (!auth.authenticated) return auth.response;

  return proxyObserverRequest(API_ENDPOINTS.STREAMING.HEALTH, {
    method: "GET",
  });
}
