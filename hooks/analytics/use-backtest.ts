import { useCallback, useEffect, useState } from "react";
import {
  loadLastBacktest,
  saveLastBacktest,
  type CachedBacktestParams,
} from "@/lib/backtest-setup";
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
  params: CachedBacktestParams | null;
}

/**
 * Runs the selected strategy backtest via the analytics proxy.
 * The last successful result is restored from sessionStorage so returning
 * from a setup chart still shows the table.
 */
export function useBacktest() {
  const [state, setState] = useState<BacktestState>({
    data: null,
    isLoading: false,
    error: null,
    params: null,
  });

  useEffect(() => {
    const cached = loadLastBacktest();
    if (!cached) {
      return;
    }
    setState((prev) => {
      if (prev.data) {
        return prev;
      }
      return {
        data: cached.result,
        isLoading: false,
        error: null,
        params: cached.params,
      };
    });
  }, []);

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
        setState({ data: null, isLoading: false, error: message, params });
        return null;
      }

      const result = payload as AnyBacktestResult;
      saveLastBacktest(params, result);
      setState({ data: result, isLoading: false, error: null, params });
      return result;
    } catch (error) {
      setState({
        data: null,
        isLoading: false,
        error: error instanceof Error ? error.message : "Backtest failed",
        params,
      });
      return null;
    }
  }, []);

  return { ...state, run };
}
