"use client";

import useSWR from "swr";

const ADMIN_TOKEN_KEY = "fx-alert:admin-token";

function getApiBase(): string {
  return process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
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

  const response = await fetch(`${getApiBase()}${path}`, {
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

export function useAdminActivity(enabled: boolean, eventType?: string) {
  const query = eventType
    ? `?event_type=${encodeURIComponent(eventType)}&limit=100`
    : "?limit=100";
  return useSWR(enabled ? `/api/v1/admin/activity${query}` : null, adminFetcher, {
    refreshInterval: 60_000,
  });
}

export function useAdminHealth(enabled: boolean) {
  return useSWR(enabled ? "/api/v1/admin/system/health" : null, adminFetcher, {
    refreshInterval: 60_000,
  });
}

export { ADMIN_TOKEN_KEY, getApiBase, getAdminToken };
