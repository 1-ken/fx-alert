import type { BootstrapData } from "@/lib/api/bootstrap";
import {
  CALL_CUSTOM_MESSAGE_MAX_CHARS,
  CUSTOM_MESSAGE_MAX_CHARS,
  type DefaultNotifyChannel,
} from "@/lib/alert-preferences";
import { FREE_MAX_ALERTS } from "@/lib/pricing";
import { getChannelLimitState } from "@/lib/subscription-limits";
import type { Alert, AlertType, AlertUpsertInput } from "@/types/alerts";

/** Alert types that accept many pairs in one create. */
export const WATCH_TYPES = [
  "prev_day_level",
  "structure_session",
  "sweep_confirm",
  "hour_sweep_cisd",
] as const;

export type WatchType = (typeof WATCH_TYPES)[number];

export const WATCH_TYPE_LABELS: Record<WatchType, string> = {
  prev_day_level: "PDH/PDL",
  structure_session: "Session",
  sweep_confirm: "Sweep confirm",
  hour_sweep_cisd: "1h sweep + CISD",
};

/** Must match kMaxBatchPairs in ctraderplus-cpp/src/alerts/AlertManager.h. */
export const MAX_BATCH_PAIRS = 100;

export function isWatchType(value: AlertType | string): value is WatchType {
  return (WATCH_TYPES as readonly string[]).includes(value);
}

/** EURUSD, EUR/USD and eur-usd all map to the same key. */
export function pairKey(pair: string): string {
  return pair.replace(/[^a-z0-9]/gi, "").toUpperCase();
}

export function pairLabel(pair: string): string {
  const key = pairKey(pair);
  return key.length === 6 && /^[A-Z]{6}$/.test(key) ? `${key.slice(0, 3)}/${key.slice(3)}` : key;
}

export function endOfUtcDayIso(now: number): string {
  const d = new Date(now);
  d.setUTCHours(23, 59, 59, 999);
  return d.toISOString();
}

export function defaultWatchExpiry(type: WatchType, now: number): string {
  return type === "prev_day_level"
    ? endOfUtcDayIso(now)
    : new Date(now + 24 * 3_600_000).toISOString();
}

/** Same rule as the create form: "any" needs a single timeframe. */
export function validateSessionDirection(
  intervals: readonly string[],
  direction: string,
): string | null {
  if (intervals.length === 0) return "Select at least one timeframe";
  if (intervals.length > 1 && direction === "any") {
    return "Pick bull or bear when more than one timeframe is selected";
  }
  return null;
}

export interface WatchPayloadContext {
  channel: DefaultNotifyChannel;
  phone: string;
  email: string;
  /** Required by the server for Call and SMS. Ignored for Sound and Email. */
  message?: string;
  now: number;
}

export const DEFAULT_WATCH_MESSAGE = "Favorites watch alert";
export const WATCH_MESSAGE_STORAGE_KEY = "fx-alert:watch-message";

export function watchNeedsMessage(channel: DefaultNotifyChannel): boolean {
  return channel === "sms" || channel === "call";
}

export function watchMessageMaxChars(channel: DefaultNotifyChannel): number {
  return channel === "call" ? CALL_CUSTOM_MESSAGE_MAX_CHARS : CUSTOM_MESSAGE_MAX_CHARS;
}

export function channelsFor(channel: DefaultNotifyChannel): Array<"sms" | "call" | "email" | "sound"> {
  return channel === "sound" ? ["sound"] : [channel, "sound"];
}

export function buildWatchPayload(
  type: WatchType,
  pairs: readonly string[],
  ctx: WatchPayloadContext,
): AlertUpsertInput {
  const apiPairs = [...new Set(pairs.map(pairKey).filter(Boolean))];
  const channels = channelsFor(ctx.channel);
  const needsPhone = channels.includes("sms") || channels.includes("call");
  const needsEmail = channels.includes("email");
  const base: AlertUpsertInput = {
    alert_type: type,
    pair: apiPairs[0] ?? "",
    pairs: apiPairs,
    channels,
    email: needsEmail ? ctx.email : undefined,
    phone: needsPhone ? ctx.phone : "",
    expires_at: defaultWatchExpiry(type, ctx.now),
    ...(watchNeedsMessage(ctx.channel) && ctx.message?.trim()
      ? { custom_message: ctx.message.trim() }
      : {}),
  };
  switch (type) {
    case "prev_day_level":
      return { ...base, level_ref: "both", dol_trigger: ["sweep"] };
    case "structure_session":
      return {
        ...base,
        intervals: ["5m"],
        structure_event: ["bos", "choch", "sweep"],
        structure_direction: "any",
      };
    case "sweep_confirm":
      return {
        ...base,
        interval: "5m",
        structure_event: ["bos", "cisd"],
        structure_direction: "any",
      };
    case "hour_sweep_cisd":
      return {
        ...base,
        interval: "5m",
        structure_event: ["cisd"],
        structure_direction: "any",
      };
  }
}

export function chunkPairs<T>(items: readonly T[], size = MAX_BATCH_PAIRS): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export interface WatchStep {
  type: WatchType;
  pairs: string[];
}

/** One step per type and 100-pair chunk, in a fixed type order. */
export function planWatchSteps(
  types: readonly WatchType[],
  pairs: readonly string[],
): WatchStep[] {
  const unique = [...new Set(pairs.map(pairKey).filter(Boolean))];
  const steps: WatchStep[] = [];
  for (const type of WATCH_TYPES) {
    if (!types.includes(type)) continue;
    for (const chunk of chunkPairs(unique)) steps.push({ type, pairs: chunk });
  }
  return steps;
}

export function remainingAlertCapacity(
  bootstrap: BootstrapData | null | undefined,
  activeCount: number,
): number {
  if ((bootstrap?.subscriptionTier ?? "none") !== "free") return Number.POSITIVE_INFINITY;
  const max = bootstrap?.freeTierLimits?.maxAlerts ?? FREE_MAX_ALERTS;
  return Math.max(0, max - activeCount);
}

export type WatchCheck = { ok: true; total: number } | { ok: false; error: string };

export function checkWatchRequest(args: {
  types: readonly WatchType[];
  pairs: readonly string[];
  channel: DefaultNotifyChannel;
  phone: string;
  email: string;
  message?: string;
  bootstrap: BootstrapData | null | undefined;
  activeCount: number;
}): WatchCheck {
  const pairCount = new Set(args.pairs.map(pairKey).filter(Boolean)).size;
  if (pairCount === 0) return { ok: false, error: "Add favorites first." };
  if (args.types.length === 0) return { ok: false, error: "Select at least one alert type." };
  if ((args.channel === "sms" || args.channel === "call") && !args.phone.trim()) {
    return { ok: false, error: "Add a phone number in Settings to use Call or SMS." };
  }
  if (watchNeedsMessage(args.channel)) {
    const message = (args.message ?? "").trim();
    const max = watchMessageMaxChars(args.channel);
    if (!message) return { ok: false, error: "Enter a message for Call and SMS alerts." };
    if (message.length > max) {
      return { ok: false, error: `Message must be ${max} characters or less.` };
    }
  }
  if (args.channel === "email" && !args.email.trim()) {
    return { ok: false, error: "No email address on your account for email alerts." };
  }
  if (args.channel !== "sound") {
    const limit = getChannelLimitState(args.channel, args.bootstrap);
    if (limit.disabled) return { ok: false, error: limit.reason ?? "Channel unavailable." };
  }
  const total = pairCount * args.types.length;
  const remaining = remainingAlertCapacity(args.bootstrap, args.activeCount);
  if (total > remaining) {
    return {
      ok: false,
      error: `You can add ${remaining} more alert${remaining === 1 ? "" : "s"}; this would add ${total}. Uncheck pairs or types.`,
    };
  }
  return { ok: true, total };
}

export interface WatchedPair {
  key: string;
  pair: string;
  isFavorite: boolean;
  byType: Record<WatchType, string[]>;
}

export interface WatchedSummary {
  pairs: WatchedPair[];
  unwatchedFavorites: string[];
}

function emptyByType(): Record<WatchType, string[]> {
  return {
    prev_day_level: [],
    structure_session: [],
    sweep_confirm: [],
    hour_sweep_cisd: [],
  };
}

/** Active or waiting alerts of the four watch types, grouped by pair. */
export function summarizeWatched(
  alerts: readonly Alert[],
  favorites: readonly string[],
): WatchedSummary {
  const favoriteKeys = new Set(favorites.map(pairKey));
  const map = new Map<string, WatchedPair>();
  for (const alert of alerts) {
    if (!isWatchType(alert.alert_type)) continue;
    if (alert.status !== "active" && alert.status !== "waiting") continue;
    const key = pairKey(alert.pair);
    if (!key) continue;
    let row = map.get(key);
    if (!row) {
      row = { key, pair: pairLabel(alert.pair), isFavorite: favoriteKeys.has(key), byType: emptyByType() };
      map.set(key, row);
    }
    row.byType[alert.alert_type].push(alert.id);
  }
  const pairs = [...map.values()].sort((a, b) => a.pair.localeCompare(b.pair));
  const unwatchedFavorites = favorites
    .filter((pair) => !map.has(pairKey(pair)))
    .map(pairLabel)
    .sort((a, b) => a.localeCompare(b));
  return { pairs, unwatchedFavorites };
}

/** Extracts a readable message from a failed create response body. */
export function errorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  try {
    const parsed = JSON.parse(raw) as { detail?: unknown; error?: unknown; message?: unknown };
    for (const value of [parsed.detail, parsed.error, parsed.message]) {
      if (typeof value === "string" && value) return value;
    }
  } catch {
    // not JSON
  }
  return raw || "Request failed";
}
