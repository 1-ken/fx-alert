/**
 * API Endpoints Constants
 * 
 * All API endpoint paths should be defined here.
 * The base URL is configured via NEXT_PUBLIC_API_URL environment variable.
 */

// Base URL from environment variable
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "";
export const EXPLICIT_OBSERVER_WS_URL = process.env.NEXT_PUBLIC_OBSERVER_WS_URL?.trim() || "";

function deriveWebSocketBaseFromApiUrl(apiUrl: string): string | null {
  if (!apiUrl.trim()) {
    return null;
  }

  try {
    const parsed = new URL(apiUrl);
    const protocol = parsed.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${parsed.host}`;
  } catch {
    return null;
  }
}

export const OBSERVER_WS_BASE_URL =
  EXPLICIT_OBSERVER_WS_URL ||
  deriveWebSocketBaseFromApiUrl(API_BASE_URL) ||
  "ws://127.0.0.1:8000";

/**
 * UI Constants
 * 
 * Global UI configuration that can be adjusted application-wide
 */
export const UI_CONSTANTS = {
  // Font Size Scale (in rem units, where 1rem = 16px by default)
  FONT_SIZE: {
    xs: "0.75rem",    // 12px
    sm: "0.875rem",   // 14px
    base: "1rem",     // 16px - DEFAULT
    lg: "1.125rem",   // 18px
    xl: "1.25rem",    // 20px
    "2xl": "1.5rem",  // 24px
    "3xl": "1.875rem",// 30px
    "4xl": "2.25rem", // 36px
  },
  // Global font size multiplier (1 = normal, 1.1 = 10% larger, 0.9 = 10% smaller)
  FONT_SIZE_MULTIPLIER: 1.25,
} as const;

// Authentication endpoints
export const API_ENDPOINTS = {
  ALERTS: {
    LIST: "/api/v1/alerts",
    CREATE: "/api/v1/alerts",
    DELETE: "/api/v1/alerts",
  },
  STREAMING: {
    SNAPSHOT: "/snapshot",
    WEBSOCKET: "/ws/observe",
    HEALTH: "/stream-health",
    CLIENT_CONFIG: "/client-config",
    SERVICE_HEALTH: "/health",
    HISTORICAL_OHLC: "/historical/ohlc",
    HISTORICAL_STREAM_METRICS: "/historical/stream-metrics",
    HISTORICAL_OHLC_WITH_FORMING: "/historical/ohlc-with-forming",
  },
  OBSERVER_PROXY: {
    ALERTS: "/api/observer/alerts",
    FAVORITES: "/api/observer/favorites",
    SNAPSHOT: "/api/observer/snapshot",
    HEALTH: "/api/observer/stream-health",
    CLIENT_CONFIG: "/api/observer/client-config",
    WS_TOKEN: "/api/observer/ws-token",
    SERVICE_HEALTH: "/api/observer/health",
    HISTORICAL_OHLC: "/api/observer/historical/ohlc",
    HISTORICAL_STREAM_METRICS: "/api/observer/historical/stream-metrics",
    HISTORICAL_OHLC_WITH_FORMING: "/api/observer/historical/ohlc-with-forming",
  },
  // Add your own API endpoints here
 
} as const;

/**
 * Helper function to build full API URL from endpoint path
 * @param endpoint - The API endpoint path
 * @returns Full API URL
 */
export function getApiUrl(endpoint: string): string {
  if (!API_BASE_URL) {
    throw new Error("NEXT_PUBLIC_API_URL environment variable is not set");
  }
  
  // Remove leading slash from endpoint if present
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint.slice(1) : endpoint;
  
  // Remove trailing slash from base URL if present
  const cleanBaseUrl = API_BASE_URL.endsWith("/") 
    ? API_BASE_URL.slice(0, -1) 
    : API_BASE_URL;
  
  return `${cleanBaseUrl}/${cleanEndpoint}`;
}

export function getObserverWebSocketUrl(path = API_ENDPOINTS.STREAMING.WEBSOCKET): string {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const cleanBaseUrl = OBSERVER_WS_BASE_URL.endsWith("/")
    ? OBSERVER_WS_BASE_URL.slice(0, -1)
    : OBSERVER_WS_BASE_URL;

  return `${cleanBaseUrl}${cleanPath}`;
}

export function normalizeObserverWebSocketUrl(
  rawUrl?: string,
  path = API_ENDPOINTS.STREAMING.WEBSOCKET
): string {
  const fallbackUrl = getObserverWebSocketUrl(path);

  if (!rawUrl?.trim()) {
    return fallbackUrl;
  }

  try {
    const url = new URL(rawUrl);

    if (url.protocol === "http:") {
      url.protocol = "ws:";
    } else if (url.protocol === "https:") {
      url.protocol = "wss:";
    } else if (url.protocol !== "ws:" && url.protocol !== "wss:") {
      return fallbackUrl;
    }

    if (!url.pathname || url.pathname === "/") {
      url.pathname = path.startsWith("/") ? path : `/${path}`;
    }

    return url.toString();
  } catch {
    return fallbackUrl;
  }
}
