import { proxyObserverRequest } from "@/lib/observer-api";
import { validateApiAuth } from "@/lib/api-auth";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ pair: string }> },
) {
  const auth = await validateApiAuth();
  if (!auth.authenticated) return auth.response;

  const { pair } = await context.params;
  return proxyObserverRequest(`/api/v1/me/favorites/${encodeURIComponent(pair)}`, {
    method: "DELETE",
  });
}
