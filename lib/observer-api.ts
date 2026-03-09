import {
  API_ENDPOINTS,
  EXPLICIT_OBSERVER_WS_URL,
  getApiUrl,
  normalizeObserverWebSocketUrl,
} from "@/lib/constants";

export function getObserverApiUrl(endpoint: string): string {
  return getApiUrl(endpoint);
}

export async function proxyObserverRequest(
  endpoint: string,
  init?: RequestInit
): Promise<Response> {
  const upstreamResponse = await fetch(getObserverApiUrl(endpoint), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
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

export async function getResolvedObserverWsUrl(): Promise<string> {
  if (EXPLICIT_OBSERVER_WS_URL) {
    return normalizeObserverWebSocketUrl(EXPLICIT_OBSERVER_WS_URL);
  }

  try {
    const configResponse = await fetch(getObserverApiUrl(API_ENDPOINTS.STREAMING.CLIENT_CONFIG), {
      cache: "no-store",
    });

    if (!configResponse.ok) {
      return normalizeObserverWebSocketUrl();
    }

    const config = (await configResponse.json()) as { wsUrl?: string };
    return normalizeObserverWebSocketUrl(config.wsUrl);
  } catch {
    return normalizeObserverWebSocketUrl();
  }
}
