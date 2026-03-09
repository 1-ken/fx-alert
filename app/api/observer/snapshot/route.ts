import { API_ENDPOINTS } from "@/lib/constants";
import { proxyObserverRequest } from "@/lib/observer-api";

export async function GET() {
  return proxyObserverRequest(API_ENDPOINTS.STREAMING.SNAPSHOT, {
    method: "GET",
  });
}
