import { proxyObserverRequest } from "@/lib/observer-api";
import { validateApiAuth } from "@/lib/api-auth";

export async function GET() {
  const auth = await validateApiAuth();
  if (!auth.authenticated) return auth.response;

  return proxyObserverRequest("/api/v1/me/favorites", { method: "GET" });
}

export async function POST(request: Request) {
  const auth = await validateApiAuth();
  if (!auth.authenticated) return auth.response;

  const body = await request.text();
  return proxyObserverRequest("/api/v1/me/favorites", {
    method: "POST",
    body,
  });
}
