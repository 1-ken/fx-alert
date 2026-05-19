import { API_ENDPOINTS } from "@/lib/constants";
import { proxyObserverRequest } from "@/lib/observer-api";
import { validateApiAuth } from "@/lib/api-auth";

export async function GET(
  _request: Request,
  context: { params: Promise<{ alertId: string }> }
) {
  const auth = await validateApiAuth();
  if (!auth.authenticated) return auth.response;

  const { alertId } = await context.params;

  return proxyObserverRequest(`${API_ENDPOINTS.ALERTS.LIST}/${alertId}`, {
    method: "GET",
  });
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ alertId: string }> }
) {
  const auth = await validateApiAuth();
  if (!auth.authenticated) return auth.response;

  const { alertId } = await context.params;
  const body = await request.text();

  return proxyObserverRequest(`${API_ENDPOINTS.ALERTS.LIST}/${alertId}`, {
    method: "PUT",
    body,
  });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ alertId: string }> }
) {
  const auth = await validateApiAuth();
  if (!auth.authenticated) return auth.response;

  const { alertId } = await context.params;

  return proxyObserverRequest(`${API_ENDPOINTS.ALERTS.DELETE}/${alertId}`, {
    method: "DELETE",
  });
}
