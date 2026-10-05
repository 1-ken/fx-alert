import type { Alert, AlertChannel, AlertEvent } from "@/types/alerts";
import {
  KNOWN_TRIGGER_KEYS_KEY,
  LAST_VISIT_AT_KEY,
  MAX_KNOWN_TRIGGER_KEYS,
  SOUND_TRIGGER_RECENCY_MS,
} from "@/lib/alert-sound";

export type TriggerNotification = {
  /** alert_events row id; unique per firing (repeating alerts fire many times). */
  triggerKey: string;
  eventId: string;
  alertId: string;
  pair: string;
  alertType: string;
  channel: AlertChannel;
  triggeredAt: string;
  alert: Alert;
};

/** More new firings than this in one batch are announced as a single summary. */
const MAX_BATCH_TOASTS = 3;

class FeedNode {
  item: TriggerNotification;
  next: FeedNode | null;

  constructor(item: TriggerNotification) {
    this.item = item;
    this.next = null;
  }
}

export function toTriggerNotification(event: AlertEvent): TriggerNotification | null {
  if (!event.id || !event.alert_id || !event.triggered_at) {
    return null;
  }

  const alert = (event.data && typeof event.data === "object" ? event.data : {}) as Alert;
  return {
    triggerKey: event.id,
    eventId: event.id,
    alertId: event.alert_id,
    pair: event.pair,
    alertType: event.alert_type,
    channel: alert.channel ?? "sound",
    triggeredAt: event.triggered_at,
    alert,
  };
}

function isRecentSoundTrigger(notification: TriggerNotification, nowMs: number): boolean {
  const channels =
    notification.alert.channels && notification.alert.channels.length > 0
      ? notification.alert.channels
      : [notification.channel];
  if (!channels.includes("sound") && notification.channel !== "sound") {
    return false;
  }

  const triggeredMs = Date.parse(notification.triggeredAt);
  if (!Number.isFinite(triggeredMs)) {
    return false;
  }

  return nowMs - triggeredMs <= SOUND_TRIGGER_RECENCY_MS;
}

function loadStringArray(key: string): string[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

function persistStringArray(key: string, values: string[]): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(values));
  } catch {
    // Storage full or unavailable; keys stay in memory for this session.
  }
}

function loadLastVisitAt(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(LAST_VISIT_AT_KEY);
  return raw && raw.length > 0 ? raw : null;
}

function byTriggeredAtAsc(a: TriggerNotification, b: TriggerNotification): number {
  return Date.parse(a.triggeredAt) - Date.parse(b.triggeredAt);
}

class NotificationCenter {
  private knownKeys = new Set<string>();
  /** FIFO — dequeue from front */
  private soundQueue: TriggerNotification[] = [];
  /** LIFO — pop from end (newest first) */
  private toastStack: TriggerNotification[] = [];
  private feedHead: FeedNode | null = null;
  private summaryCount = 0;
  private hydrated = false;
  private lastVisitAt: string | null = null;
  private listeners = new Set<() => void>();

  constructor() {
    this.loadPersistence();
  }

  private loadPersistence(): void {
    this.lastVisitAt = loadLastVisitAt();
    for (const key of loadStringArray(KNOWN_TRIGGER_KEYS_KEY)) {
      this.knownKeys.add(key);
    }
  }

  private persistKnownKeys(): void {
    const keys = [...this.knownKeys];
    const capped =
      keys.length > MAX_KNOWN_TRIGGER_KEYS
        ? keys.slice(keys.length - MAX_KNOWN_TRIGGER_KEYS)
        : keys;
    persistStringArray(KNOWN_TRIGGER_KEYS_KEY, capped);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  /** Adds new firings (oldest first) to the feed, sound queue and toasts. */
  private announce(fresh: TriggerNotification[], nowMs: number): void {
    fresh.sort(byTriggeredAtAsc);
    for (const notification of fresh) {
      const node = new FeedNode(notification);
      node.next = this.feedHead;
      this.feedHead = node;
      if (isRecentSoundTrigger(notification, nowMs)) {
        this.soundQueue.push(notification);
      }
    }
    if (fresh.length > MAX_BATCH_TOASTS) {
      this.summaryCount += fresh.length;
    } else {
      this.toastStack.push(...fresh);
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  get isHydrated(): boolean {
    return this.hydrated;
  }

  getLastVisitAt(): string | null {
    return this.lastVisitAt;
  }

  getActivityFeed(): TriggerNotification[] {
    const items: TriggerNotification[] = [];
    let node = this.feedHead;
    while (node) {
      items.push(node.item);
      node = node.next;
    }
    return items;
  }

  /**
   * First successful events fetch: mark all firings as known. Unread firings since the
   * last visit are announced; older history stays silent.
   */
  hydrateFromEvents(events: AlertEvent[]): void {
    if (this.hydrated) {
      return;
    }

    const lastVisitMs = this.lastVisitAt ? Date.parse(this.lastVisitAt) : Number.NaN;
    const missed: TriggerNotification[] = [];

    for (const event of events) {
      const notification = toTriggerNotification(event);
      if (!notification) {
        continue;
      }
      const triggeredMs = Date.parse(notification.triggeredAt);
      if (
        !this.knownKeys.has(notification.triggerKey) &&
        !event.read_at &&
        Number.isFinite(lastVisitMs) &&
        Number.isFinite(triggeredMs) &&
        triggeredMs > lastVisitMs
      ) {
        missed.push(notification);
      }
      this.knownKeys.add(notification.triggerKey);
    }

    this.announce(missed, Date.now());
    this.persistKnownKeys();
    this.hydrated = true;

    if (!this.lastVisitAt) {
      this.markVisitNow();
    }

    this.notify();
  }

  /**
   * Diff against known keys; new unread firings update feed, toast stack, and sound queue.
   */
  ingestEvents(events: AlertEvent[]): void {
    if (!this.hydrated) {
      return;
    }

    const fresh: TriggerNotification[] = [];
    for (const event of events) {
      const notification = toTriggerNotification(event);
      if (!notification || this.knownKeys.has(notification.triggerKey)) {
        continue;
      }
      this.knownKeys.add(notification.triggerKey);
      if (!event.read_at) {
        fresh.push(notification);
      }
    }

    if (fresh.length > 0) {
      this.announce(fresh, Date.now());
      this.persistKnownKeys();
      this.notify();
    }
  }

  peekToasts(): readonly TriggerNotification[] {
    return this.toastStack;
  }

  popNextToast(): TriggerNotification | null {
    const item = this.toastStack.pop() ?? null;
    if (item) {
      this.notify();
    }
    return item;
  }

  peekSummaryCount(): number {
    return this.summaryCount;
  }

  /** Returns, once, how many firings were collapsed into a summary toast. */
  takeSummaryCount(): number {
    const count = this.summaryCount;
    if (count > 0) {
      this.summaryCount = 0;
      this.notify();
    }
    return count;
  }

  dequeueSound(): TriggerNotification | null {
    const item = this.soundQueue.shift() ?? null;
    if (item) {
      this.notify();
    }
    return item;
  }

  hasPendingSound(): boolean {
    return this.soundQueue.length > 0;
  }

  markVisitNow(): void {
    if (typeof window === "undefined") {
      return;
    }

    const now = new Date().toISOString();
    this.lastVisitAt = now;
    window.localStorage.setItem(LAST_VISIT_AT_KEY, now);
    this.notify();
  }

  resetForTests(): void {
    this.knownKeys.clear();
    this.soundQueue = [];
    this.toastStack = [];
    this.feedHead = null;
    this.summaryCount = 0;
    this.hydrated = false;
    this.lastVisitAt = null;
    this.notify();
  }
}

export const notificationCenter = new NotificationCenter();

let visitTrackingInstalled = false;

export function installVisitTracking(): () => void {
  if (typeof window === "undefined" || visitTrackingInstalled) {
    return () => {};
  }

  visitTrackingInstalled = true;

  const onHidden = () => {
    if (document.visibilityState === "hidden") {
      notificationCenter.markVisitNow();
    }
  };

  const onPageHide = () => {
    notificationCenter.markVisitNow();
  };

  document.addEventListener("visibilitychange", onHidden);
  window.addEventListener("pagehide", onPageHide);

  return () => {
    visitTrackingInstalled = false;
    document.removeEventListener("visibilitychange", onHidden);
    window.removeEventListener("pagehide", onPageHide);
  };
}
