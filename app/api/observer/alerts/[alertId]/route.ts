import { API_ENDPOINTS } from "@/lib/constants";
import { proxyObserverRequest } from "@/lib/observer-api";

export async function GET(
  _request: Request,
  context: { params: Promise<{ alertId: string }> }
) {
  const { alertId } = await context.params;

  return proxyObserverRequest(`${API_ENDPOINTS.ALERTS.LIST}/${alertId}`, {
    method: "GET",
  });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ alertId: string }> }
) {
  const { alertId } = await context.params;

  return proxyObserverRequest(`${API_ENDPOINTS.ALERTS.DELETE}/${alertId}`, {
    method: "DELETE",
  });
}
