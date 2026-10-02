import { API_ENDPOINTS } from "@/lib/constants";
import { proxyObserverRequest } from "@/lib/observer-api";
import { validateApiAuth } from "@/lib/api-auth";

export async function POST(
  _request: Request,
  context: { params: Promise<{ eventId: string }> },
) {
  const auth = await validateApiAuth();
  if (!auth.authenticated) return auth.response;

  const { eventId } = await context.params;
  return proxyObserverRequest(`${API_ENDPOINTS.ALERTS.EVENTS}/${eventId}/read`, {
    method: "POST",
  });
}
