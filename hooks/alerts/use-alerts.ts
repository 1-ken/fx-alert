import { useCallback } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { API_ENDPOINTS } from "@/lib/constants";
import { fetcher } from "@/hooks/use-observer";
import type {
  Alert,
  AlertUpsertInput,
  AlertUpsertResponse,
  AlertsResponse,
} from "@/types/alerts";

export function useObserverAlerts() {
  const { data, error, isLoading, mutate } = useSWR<AlertsResponse>(
    API_ENDPOINTS.OBSERVER_PROXY.ALERTS,
    fetcher,
    {
      revalidateOnFocus: false,
    }
  );

  const createAlert = useCallback(
    async (input: AlertUpsertInput): Promise<Alert | null> => {
      const response = await fetch(API_ENDPOINTS.OBSERVER_PROXY.ALERTS, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(body || "Failed to create alert");
      }

      const payload = (await response.json()) as AlertUpsertResponse;
      await mutate();
      toast.success("Alert created successfully");
      return payload.alert;
    },
    [mutate]
  );

  const deleteAlert = useCallback(
    async (alertId: string): Promise<void> => {
      const optimistic = data
        ? {
            ...data,
            active: data.active.filter((alert) => alert.id !== alertId),
            triggered: data.triggered.filter((alert) => alert.id !== alertId),
            all: data.all.filter((alert) => alert.id !== alertId),
            total: data.total > 0 ? data.total - 1 : 0,
          }
        : undefined;

      await mutate(optimistic, { revalidate: false });

      const response = await fetch(`${API_ENDPOINTS.OBSERVER_PROXY.ALERTS}/${alertId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        await mutate();
        const body = await response.text();
        throw new Error(body || "Failed to delete alert");
      }

      await mutate();
      toast.success("Alert deleted");
    },
    [data, mutate]
  );

  return {
    alerts: data,
    isLoading,
    error,
    mutate,
    createAlert,
    deleteAlert,
  };
}
