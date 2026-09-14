import {
  API_ENDPOINTS,
  EXPLICIT_OBSERVER_WS_URL,
  normalizeObserverWebSocketUrl,
} from "@/lib/constants";
import { getObserverServerBaseUrl } from "@/lib/observer-server-url";
import { resolveObserverAccessToken } from "@/lib/observer-access-token";

export async function getObserverApiUrl(endpoint: string): Promise<string> {
  const base = await getObserverServerBaseUrl();
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint.slice(1) : endpoint;
  return `${base}/${cleanEndpoint}`;
}

export async function proxyObserverRequest(
  endpoint: string,
  init?: RequestInit,
  accessToken?: string
): Promise<Response> {
  const token = accessToken ?? (await resolveObserverAccessToken());
  if (!token) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const upstreamResponse = await fetch(await getObserverApiUrl(endpoint), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
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

export async function getResolvedObserverWsUrl(accessToken?: string): Promise<string> {
  const token = accessToken ?? (await resolveObserverAccessToken());

  if (EXPLICIT_OBSERVER_WS_URL) {
    return appendAccessToken(
      normalizeObserverWebSocketUrl(EXPLICIT_OBSERVER_WS_URL),
      token
    );
  }

  try {
    const headers: HeadersInit = { cache: "no-store" };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const configResponse = await fetch(await getObserverApiUrl(API_ENDPOINTS.STREAMING.CLIENT_CONFIG), {
      headers,
      cache: "no-store",
    });

    if (!configResponse.ok) {
      return appendAccessToken(normalizeObserverWebSocketUrl(), token);
    }

    const config = (await configResponse.json()) as { wsUrl?: string };
    return appendAccessToken(normalizeObserverWebSocketUrl(config.wsUrl), token);
  } catch {
    return appendAccessToken(normalizeObserverWebSocketUrl(), token);
  }
}

export function appendAccessToken(wsUrl: string, accessToken: string | null): string {
  if (!accessToken) {
    return wsUrl;
  }

  try {
    const url = new URL(wsUrl);
    url.searchParams.set("access_token", accessToken);
    return url.toString();
  } catch {
    return wsUrl;
  }
}
