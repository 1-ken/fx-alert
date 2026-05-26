import type { Alert, AlertChannel } from "@/types/alerts";
import {
  KNOWN_TRIGGER_KEYS_KEY,
  LAST_VISIT_AT_KEY,
  MAX_KNOWN_TRIGGER_KEYS,
  SOUND_TRIGGER_RECENCY_MS,
  VISIT_BANNER_MAX_AGE_MS,
} from "@/lib/alert-sound";

export type TriggerNotification = {
  triggerKey: string;
  alertId: string;
  pair: string;
  channel: AlertChannel;
  triggeredAt: string;
  alert: Alert;
};

class FeedNode {
  item: TriggerNotification;
  next: FeedNode | null;

  constructor(item: TriggerNotification) {
    this.item = item;
    this.next = null;
  }
}

function makeTriggerKey(alert: Alert): string | null {
  if (!alert.triggered_at) {
    return null;
  }
  return `${alert.id}:${alert.triggered_at}`;
}

export function toTriggerNotification(alert: Alert): TriggerNotification | null {
  const triggerKey = makeTriggerKey(alert);
  if (!triggerKey) {
    return null;
  }

  return {
    triggerKey,
    alertId: alert.id,
    pair: alert.pair,
    channel: alert.channel,
    triggeredAt: alert.triggered_at!,
    alert,
  };
}

function isRecentSoundTrigger(notification: TriggerNotification, nowMs: number): boolean {
  if (notification.channel !== "sound") {
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

  window.localStorage.setItem(key, JSON.stringify(values));
}

function loadLastVisitAt(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(LAST_VISIT_AT_KEY);
  return raw && raw.length > 0 ? raw : null;
}

class NotificationCenter {
  private knownKeys = new Map<string, TriggerNotification>();
  /** FIFO — dequeue from front */
  private soundQueue: TriggerNotification[] = [];
  /** LIFO — pop from end (newest first) */
  private toastStack: TriggerNotification[] = [];
  private feedHead: FeedNode | null = null;
  private hydrated = false;
  private lastVisitAt: string | null = null;
  private listeners = new Set<() => void>();

  constructor() {
    this.loadPersistence();
  }

  private loadPersistence(): void {
    this.lastVisitAt = loadLastVisitAt();
    for (const key of loadStringArray(KNOWN_TRIGGER_KEYS_KEY)) {
      if (!this.knownKeys.has(key)) {
        this.knownKeys.set(key, {
          triggerKey: key,
          alertId: key.split(":")[0] ?? key,
          pair: "",
          channel: "email",
          triggeredAt: key.split(":").slice(1).join(":") || "",
          alert: {} as Alert,
        });
      }
    }
  }

  private persistKnownKeys(): void {
    const keys = [...this.knownKeys.keys()];
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
   * First successful alerts fetch: mark all triggers as known without sound/toast.
   */
  hydrateFromAlerts(triggered: Alert[]): void {
    if (this.hydrated) {
      return;
    }

    for (const alert of triggered) {
      const notification = toTriggerNotification(alert);
      if (!notification) {
        continue;
      }
      this.knownKeys.set(notification.triggerKey, notification);
    }

    this.persistKnownKeys();
    this.hydrated = true;

    if (!this.lastVisitAt) {
      this.markVisitNow();
    }

    this.notify();
  }

  /**
   * Diff against known keys; live new triggers update feed, toast stack, and sound queue.
   */
  ingest(triggered: Alert[]): void {
    if (!this.hydrated) {
      return;
    }

    const nowMs = Date.now();
    let changed = false;

    for (const alert of triggered) {
      const notification = toTriggerNotification(alert);
      if (!notification || this.knownKeys.has(notification.triggerKey)) {
        continue;
      }

      this.knownKeys.set(notification.triggerKey, notification);
      changed = true;

      const node = new FeedNode(notification);
      node.next = this.feedHead;
      this.feedHead = node;

      this.toastStack.push(notification);

      if (isRecentSoundTrigger(notification, nowMs)) {
        this.soundQueue.push(notification);
      }
    }

    if (changed) {
      this.persistKnownKeys();
      this.notify();
    }
  }

  getUnseenSinceVisit(allTriggered: Alert[]): TriggerNotification[] {
    if (!this.lastVisitAt) {
      return [];
    }

    const visitMs = Date.parse(this.lastVisitAt);
    const nowMs = Date.now();
    const unseen: TriggerNotification[] = [];

    for (const alert of allTriggered) {
      const notification = toTriggerNotification(alert);
      if (!notification) {
        continue;
      }

      const triggeredMs = Date.parse(notification.triggeredAt);
      if (!Number.isFinite(triggeredMs)) {
        continue;
      }

      if (triggeredMs <= visitMs) {
        continue;
      }

      if (nowMs - triggeredMs > VISIT_BANNER_MAX_AGE_MS) {
        continue;
      }

      unseen.push(notification);
    }

    return unseen.sort((a, b) => b.triggeredAt.localeCompare(a.triggeredAt));
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
