"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { mutate as globalMutate } from "swr";
import useSWR from "swr";
import {
  API_ENDPOINTS,
  EXPLICIT_OBSERVER_WS_URL,
  getObserverWebSocketUrl,
  normalizeObserverWebSocketUrl,
} from "@/lib/constants";
import { useObserverWsToken } from "@/hooks/observer/use-ws-token";
import { acquireChartWs } from "@/hooks/chart/chart-ws-shared";
import { chartFormingSwrKey, formingCandleDataEqual } from "@/lib/swr-ohlc";
import type { ChartInterval } from "@/lib/chart-utils";
import type { OhlcCandle } from "@/types/historical";
import type { ChartStreamPayload } from "@/types/snapshot";

function buildChartWsUrl(
  baseUrl: string,
  accessToken: string,
  pair: string,
  interval: ChartInterval,
): string {
  const separator = baseUrl.includes("?") ? "&" : "?";
  const params = new URLSearchParams({
    access_token: accessToken,
    pair,
    interval,
  });
  return `${baseUrl}${separator}${params.toString()}`;
}

type GroupedPairRow = {
  pair?: string;
  price?: number;
  is_forming?: boolean;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
  timestamp?: string;
  expected_open?: string;
  expected_close?: string;
  progress_percent?: number;
  time_remaining_seconds?: number;
  interval?: string;
};

function groupedPairsFromPayload(
  payload: ChartStreamPayload,
): GroupedPairRow[] {
  const pairs = payload.pairs as unknown;
  if (Array.isArray(pairs)) {
    return pairs as GroupedPairRow[];
  }
  if (pairs && typeof pairs === "object") {
    const grouped = pairs as {
      currencies?: GroupedPairRow[];
      commodities?: GroupedPairRow[];
    };
    return [...(grouped.currencies ?? []), ...(grouped.commodities ?? [])];
  }
  return [];
}

function rowToFormingCandle(row: GroupedPairRow): OhlcCandle | null {
  if (
    row.is_forming === false ||
    typeof row.open !== "number" ||
    typeof row.high !== "number" ||
    typeof row.low !== "number" ||
    typeof row.close !== "number" ||
    !row.timestamp
  ) {
    return null;
  }
  return {
    timestamp: row.timestamp,
    open: row.open,
    high: row.high,
    low: row.low,
    close: row.close,
    volume: typeof row.volume === "number" ? row.volume : 0,
    is_forming: true,
    expected_open: row.expected_open,
    expected_close: row.expected_close,
    progress_percent: row.progress_percent,
    time_remaining_seconds: row.time_remaining_seconds,
  };
}

function extractFormingFromPayload(payload: ChartStreamPayload): OhlcCandle | null {
  if (payload.forming_candle && payload.forming_candle.is_forming !== false) {
    return payload.forming_candle;
  }

  const targetPair = payload.stream?.pair;
  if (!targetPair) {
    return null;
  }

  const normalizedTarget = targetPair.replace(/[^a-z0-9]/gi, "").toUpperCase();
  for (const row of groupedPairsFromPayload(payload)) {
    const rowKey = (row.pair ?? "").replace(/[^a-z0-9]/gi, "").toUpperCase();
    if (rowKey !== normalizedTarget) {
      continue;
    }
    const forming = rowToFormingCandle(row);
    if (forming) {
      return forming;
    }
  }
  return null;
}

function extractLivePrice(payload: ChartStreamPayload): number | undefined {
  if (typeof payload.chart_live_price === "number" && Number.isFinite(payload.chart_live_price)) {
    return payload.chart_live_price;
  }

  const targetPair = payload.stream?.pair;
  if (targetPair) {
    const normalizedTarget = targetPair.replace(/[^a-z0-9]/gi, "").toUpperCase();
    for (const row of groupedPairsFromPayload(payload)) {
      const rowKey = (row.pair ?? "").replace(/[^a-z0-9]/gi, "").toUpperCase();
      if (rowKey === normalizedTarget && typeof row.price === "number") {
        return row.price;
      }
      if (rowKey === normalizedTarget && typeof row.close === "number") {
        return row.close;
      }
    }
  }

  for (const row of groupedPairsFromPayload(payload)) {
    if (typeof row.price === "number") {
      return row.price;
    }
  }
  return undefined;
}

export type ChartFormingStreamStatus = "connecting" | "live" | "offline";

/**
 * Chart-scoped WebSocket for live forming candle OHLC.
 * Uses a ref-counted shared socket per pair+interval to avoid duplicate connections.
 */
export function useChartFormingStream(
  pair: string,
  interval: ChartInterval,
  options?: { closedOhlcKey?: string | null },
) {
  const swrKey = pair ? chartFormingSwrKey(pair, interval) : null;
  const { data: wsTokenData, isLoading: isWsTokenLoading } = useObserverWsToken();
  const [status, setStatus] = useState<ChartFormingStreamStatus>("connecting");
  const prevTimestampRef = useRef<string | null>(null);
  const closedOhlcKey = options?.closedOhlcKey ?? null;

  const { data: formingCandle } = useSWR<OhlcCandle | null>(
    swrKey,
    null,
    {
      fallbackData: null,
      revalidateOnMount: false,
      revalidateIfStale: false,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      compare: formingCandleDataEqual,
    },
  );

  const wsUrl = useMemo(() => {
    const accessToken = wsTokenData?.accessToken;
    if (!accessToken || !pair) {
      return null;
    }

    let baseUrl: string | null = null;
    if (EXPLICIT_OBSERVER_WS_URL) {
      baseUrl = normalizeObserverWebSocketUrl(EXPLICIT_OBSERVER_WS_URL);
    } else if (wsTokenData?.wsUrl?.trim()) {
      baseUrl = normalizeObserverWebSocketUrl(wsTokenData.wsUrl);
    } else {
      baseUrl = getObserverWebSocketUrl(API_ENDPOINTS.STREAMING.WEBSOCKET);
    }

    return buildChartWsUrl(baseUrl, accessToken, pair, interval);
  }, [interval, pair, wsTokenData]);

  useEffect(() => {
    if (!wsUrl || isWsTokenLoading || !swrKey) {
      return;
    }

    const release = acquireChartWs(
      swrKey,
      wsUrl,
      (event) => {
        try {
          const payload = JSON.parse(event.data as string) as ChartStreamPayload;
          const forming = extractFormingFromPayload(payload);
          const livePrice = extractLivePrice(payload);

          void globalMutate(
            swrKey,
            forming,
            { revalidate: false, populateCache: true },
          );

          if (forming?.timestamp && forming.timestamp !== prevTimestampRef.current) {
            const prev = prevTimestampRef.current;
            prevTimestampRef.current = forming.timestamp;
            if (prev !== null && closedOhlcKey) {
              void globalMutate(closedOhlcKey);
            }
          }

          if (typeof livePrice === "number") {
            void globalMutate(`${swrKey}:price`, livePrice, {
              revalidate: false,
              populateCache: true,
            });
          }
        } catch (error) {
          console.error("[ChartFormingStream] Failed to parse message:", error);
        }
      },
      setStatus,
    );

    return release;
  }, [closedOhlcKey, isWsTokenLoading, swrKey, wsUrl]);

  useEffect(() => {
    if (!swrKey) {
      return;
    }
    prevTimestampRef.current = null;
    void globalMutate(swrKey, null, { revalidate: false });
    void globalMutate(`${swrKey}:price`, undefined, { revalidate: false });
  }, [interval, pair, swrKey]);

  const { data: streamLivePrice } = useSWR<number | undefined>(
    swrKey ? `${swrKey}:price` : null,
    null,
    { revalidateOnMount: false },
  );

  return {
    formingCandle: formingCandle ?? null,
    livePrice: streamLivePrice,
    status,
    isConnecting: status === "connecting",
  };
}
