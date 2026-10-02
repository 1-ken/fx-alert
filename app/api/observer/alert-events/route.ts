import { API_ENDPOINTS } from "@/lib/constants";
import { proxyObserverRequest } from "@/lib/observer-api";
import { validateApiAuth } from "@/lib/api-auth";

export async function GET(request: Request) {
  const auth = await validateApiAuth();
  if (!auth.authenticated) return auth.response;

  const query = new URL(request.url).search;
  return proxyObserverRequest(`${API_ENDPOINTS.ALERTS.EVENTS}${query}`, {
    method: "GET",
  });
}
