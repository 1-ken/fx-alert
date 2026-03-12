import useSWR from "swr";
import { API_ENDPOINTS } from "@/lib/constants";
import type { ClientConfig } from "@/types/observer";

export const fetcher = async <T>(url: string): Promise<T> => {
  const response = await fetch(url);

  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || "Request failed");
  }

  return response.json() as Promise<T>;
};

export function useObserverClientConfig() {
  return useSWR<ClientConfig>(API_ENDPOINTS.OBSERVER_PROXY.CLIENT_CONFIG, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });
}
