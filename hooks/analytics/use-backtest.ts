import { useCallback, useEffect, useRef, useState } from "react";
import {
  loadLastBacktest,
  saveLastBacktestRuns,
  type BacktestPairRun,
  type CachedBacktestParams,
} from "@/lib/backtest-setup";
import type { AnyBacktestResult, BacktestSide, BacktestStrategy } from "@/types/analytics";

export interface BacktestParams {
  pair: string;
  strategy: BacktestStrategy;
  side?: BacktestSide;
  start?: string;
  end?: string;
}

export interface BacktestManyParams {
  pairs: string[];
  strategy: BacktestStrategy;
  side?: BacktestSide;
  start?: string;
  end?: string;
}

export interface BacktestProgress {
  done: number;
  total: number;
}

interface BacktestState {
  runs: BacktestPairRun[];
  activePair: string | null;
  isLoading: boolean;
  progress: BacktestProgress | null;
  params: CachedBacktestParams | null;
}

const CONCURRENCY = 2;

function runsFromCache(
  params: CachedBacktestParams,
  result: AnyBacktestResult | undefined,
  runs: BacktestPairRun[] | undefined,
): BacktestPairRun[] {
  if (runs && runs.length > 0) {
    return runs;
  }
  if (!result) {
    return [];
  }
  return [{ pair: params.pair, result, error: null }];
}

async function fetchPair(
  pair: string,
  strategy: BacktestStrategy,
  start: string | undefined,
  end: string | undefined,
  side: BacktestSide | undefined,
): Promise<BacktestPairRun> {
  try {
    const response = await fetch("/api/analytics/backtest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pair, strategy, side: side ?? "all", start, end }),
    });
    const payload = await response.json();
    if (!response.ok) {
      const message =
        typeof payload?.error === "string"
          ? payload.error
          : typeof payload?.detail === "string"
            ? payload.detail
            : "Backtest failed";
      return { pair, result: null, error: message };
    }
    return { pair, result: payload as AnyBacktestResult, error: null };
  } catch (error) {
    return {
      pair,
      result: null,
      error: error instanceof Error ? error.message : "Backtest failed",
    };
  }
}

/**
 * Runs the selected strategy backtest via the analytics proxy.
 * Several pairs share one request wave, two at a time.
 * The last successful result is restored from sessionStorage so returning
 * from a setup chart still shows the table.
 */
export function useBacktest() {
  const chosenPair = useRef<string | null>(null);
  const [state, setState] = useState<BacktestState>({
    runs: [],
    activePair: null,
    isLoading: false,
    progress: null,
    params: null,
  });

  useEffect(() => {
    const cached = loadLastBacktest();
    if (!cached) {
      return;
    }
    setState((prev) => {
      if (prev.runs.length > 0 || prev.isLoading) {
        return prev;
      }
      const runs = runsFromCache(cached.params, cached.result, cached.runs);
      chosenPair.current = cached.params.pair;
      return {
        runs,
        activePair: cached.params.pair,
        isLoading: false,
        progress: null,
        params: cached.params,
      };
    });
  }, []);

  const setActivePair = useCallback((pair: string) => {
    chosenPair.current = pair;
    setState((prev) => ({ ...prev, activePair: pair }));
  }, []);

  const runMany = useCallback(async (params: BacktestManyParams) => {
    const pairs = Array.from(new Set(params.pairs.map((pair) => pair.trim()).filter(Boolean)));
    if (pairs.length === 0) {
      return [];
    }
    const cachedParams: CachedBacktestParams = {
      pair: pairs[0],
      pairs,
      strategy: params.strategy,
      side: params.side ?? "all",
      start: params.start,
      end: params.end,
    };
    const runs: BacktestPairRun[] = pairs.map((pair) => ({
      pair,
      result: null,
      error: null,
    }));
    chosenPair.current = pairs[0];
    setState({
      runs,
      activePair: pairs[0],
      isLoading: true,
      progress: { done: 0, total: pairs.length },
      params: cachedParams,
    });

    let next = 0;
    let done = 0;
    const worker = async () => {
      while (next < pairs.length) {
        const index = next;
        next += 1;
        const outcome = await fetchPair(
          pairs[index],
          params.strategy,
          params.start,
          params.end,
          params.side,
        );
        runs[index] = outcome;
        done += 1;
        setState((prev) => {
          const snapshot = [...runs];
          const firstOk = snapshot.find((run) => run.result)?.pair ?? pairs[0];
          const activePair =
            chosenPair.current && snapshot.some((run) => run.pair === chosenPair.current)
              ? chosenPair.current
              : firstOk;
          return {
            runs: snapshot,
            activePair,
            isLoading: done < pairs.length,
            progress: { done, total: pairs.length },
            params: { ...cachedParams, pair: activePair },
          };
        });
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, pairs.length) }, () => worker()),
    );

    const finished = [...runs];
    const activePair =
      chosenPair.current && finished.some((run) => run.pair === chosenPair.current)
        ? chosenPair.current
        : (finished.find((run) => run.result)?.pair ?? pairs[0]);
    const savedParams = { ...cachedParams, pair: activePair };
    saveLastBacktestRuns(savedParams, finished);
    setState({
      runs: finished,
      activePair,
      isLoading: false,
      progress: { done: pairs.length, total: pairs.length },
      params: savedParams,
    });
    return finished;
  }, []);

  const run = useCallback(
    async (params: BacktestParams) => {
      const finished = await runMany({
        pairs: [params.pair],
        strategy: params.strategy,
        side: params.side,
        start: params.start,
        end: params.end,
      });
      return finished[0]?.result ?? null;
    },
    [runMany],
  );

  const active =
    state.runs.find((run) => run.pair === state.activePair) ?? state.runs[0] ?? null;

  return {
    ...state,
    data: active?.result ?? null,
    error: active?.error ?? null,
    run,
    runMany,
    setActivePair,
  };
}
