import { API_ENDPOINTS } from "@/lib/constants";
import { proxyObserverRequest } from "@/lib/observer-api";
import { validateApiAuth } from "@/lib/api-auth";

export async function POST() {
  const auth = await validateApiAuth();
  if (!auth.authenticated) return auth.response;

  return proxyObserverRequest(`${API_ENDPOINTS.ALERTS.EVENTS}/read-all`, {
    method: "POST",
  });
}
