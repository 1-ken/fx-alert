"use client";

import useSWR from "swr";

const ADMIN_TOKEN_KEY = "fx-alert:admin-token";

function toAdminProxyPath(path: string): string {
  return path.replace(/^\/api\/v1\/admin/, "/api/admin");
}

function getAdminToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.sessionStorage.getItem(ADMIN_TOKEN_KEY);
}

async function adminFetcher<T>(path: string): Promise<T> {
  const token = getAdminToken();
  if (!token) {
    throw new Error("Not authenticated");
  }

  const response = await fetch(toAdminProxyPath(path), {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function useAdminOverview(enabled: boolean) {
  return useSWR(enabled ? "/api/v1/admin/metrics/extended" : null, adminFetcher, {
    refreshInterval: 60_000,
  });
}

export function useAdminUsers(enabled: boolean) {
  return useSWR(enabled ? "/api/v1/admin/metrics/users" : null, adminFetcher, {
    refreshInterval: 60_000,
  });
}

export function useAdminAlerts(enabled: boolean, status?: string) {
  const query = status ? `?status=${encodeURIComponent(status)}&limit=100` : "?limit=100";
  return useSWR(enabled ? `/api/v1/admin/alerts${query}` : null, adminFetcher, {
    refreshInterval: 60_000,
  });
}

export function useAdminActivity(
  enabled: boolean,
  eventType?: string,
  userId?: string | null,
  startDate?: string | null,
  endDate?: string | null,
) {
  const params = new URLSearchParams();
  const hasDateFilter = Boolean(startDate || endDate);
  params.set("limit", userId || hasDateFilter ? "200" : "100");
  if (eventType) {
    params.set("event_type", eventType);
  }
  if (userId) {
    params.set("user_id", userId);
  }
  if (startDate) {
    params.set("start_date", startDate);
  }
  if (endDate) {
    params.set("end_date", endDate);
  }
  const query = `?${params.toString()}`;
  return useSWR(enabled ? `/api/v1/admin/activity${query}` : null, adminFetcher, {
    refreshInterval: 60_000,
  });
}

export function useAdminHealth(enabled: boolean) {
  return useSWR(enabled ? "/api/v1/admin/system/health" : null, adminFetcher, {
    refreshInterval: 60_000,
  });
}

export function useAdminFeedback(enabled: boolean, limit = 100) {
  return useSWR(
    enabled ? `/api/v1/admin/feedback?limit=${limit}` : null,
    adminFetcher,
    { refreshInterval: 60_000 },
  );
}

export type AdminMarketerRow = {
  code: string;
  name: string;
  active: boolean;
  created_at: string;
  referral_count: number;
};

export function useAdminMarketers(enabled: boolean) {
  return useSWR(enabled ? "/api/v1/admin/marketers" : null, adminFetcher, {
    refreshInterval: 60_000,
  });
}

async function adminMutator<T>(
  path: string,
  init: RequestInit,
): Promise<T> {
  const token = getAdminToken();
  if (!token) {
    throw new Error("Not authenticated");
  }

  const response = await fetch(toAdminProxyPath(path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    let detail = `Request failed: ${response.status}`;
    try {
      const body = (await response.json()) as { detail?: string };
      if (body.detail) {
        detail = body.detail;
      }
    } catch {
      // ignore parse errors
    }
    throw new Error(detail);
  }

  return response.json() as Promise<T>;
}

export function createMarketer(code: string, name: string) {
  return adminMutator<AdminMarketerRow>("/api/v1/admin/marketers", {
    method: "POST",
    body: JSON.stringify({ code, name }),
  });
}

export function updateMarketer(
  code: string,
  payload: { name?: string; active?: boolean },
) {
  return adminMutator<AdminMarketerRow>(`/api/v1/admin/marketers/${encodeURIComponent(code)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export { ADMIN_TOKEN_KEY, getAdminToken, toAdminProxyPath };
