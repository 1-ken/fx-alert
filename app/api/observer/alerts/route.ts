import { API_ENDPOINTS } from "@/lib/constants";
import { proxyObserverRequest } from "@/lib/observer-api";

export async function GET() {
  return proxyObserverRequest(API_ENDPOINTS.ALERTS.LIST, {
    method: "GET",
  });
}

export async function POST(request: Request) {
  const body = await request.text();

  return proxyObserverRequest(API_ENDPOINTS.ALERTS.CREATE, {
    method: "POST",
    body,
  });
}
