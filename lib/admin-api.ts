function getAdminApiUrl(endpoint: string): string {
  const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint.slice(1) : endpoint;
  const cleanBaseUrl = base.endsWith("/") ? base.slice(0, -1) : base;
  return `${cleanBaseUrl}/${cleanEndpoint}`;
}

export async function proxyAdminRequest(
  endpoint: string,
  init?: RequestInit,
): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json");
  }

  const upstreamResponse = await fetch(getAdminApiUrl(endpoint), {
    ...init,
    headers,
    cache: "no-store",
  });

  const contentType = upstreamResponse.headers.get("content-type") ?? "application/json";
  const responseBody = await upstreamResponse.text();

  return new Response(responseBody, {
    status: upstreamResponse.status,
    headers: {
      "Content-Type": contentType,
    },
  });
}
