import { useCallback, useState } from "react";
import type { AnyBacktestResult, BacktestStrategy } from "@/types/analytics";

export interface BacktestParams {
  pair: string;
  strategy: BacktestStrategy;
  start?: string;
  end?: string;
}

interface BacktestState {
  data: AnyBacktestResult | null;
  isLoading: boolean;
  error: string | null;
}

/**
 * Runs the selected strategy backtest via the analytics proxy.
 */
export function useBacktest() {
  const [state, setState] = useState<BacktestState>({
    data: null,
    isLoading: false,
    error: null,
  });

  const run = useCallback(async (params: BacktestParams) => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const response = await fetch("/api/analytics/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });

      const payload = await response.json();
      if (!response.ok) {
        const message =
          typeof payload?.error === "string"
            ? payload.error
            : typeof payload?.detail === "string"
              ? payload.detail
              : "Backtest failed";
        setState({ data: null, isLoading: false, error: message });
        return null;
      }

      const result = payload as AnyBacktestResult;
      setState({ data: result, isLoading: false, error: null });
      return result;
    } catch (error) {
      setState({
        data: null,
        isLoading: false,
        error: error instanceof Error ? error.message : "Backtest failed",
      });
      return null;
    }
  }, []);

  return { ...state, run };
}
