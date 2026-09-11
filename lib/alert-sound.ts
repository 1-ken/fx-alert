export const SOUND_ALERTS_ENABLED_KEY = "fx-alert:sound-alerts-enabled";
export const ALERT_SOUND_MODE_KEY = "fx-alert:alert-sound-mode";
export const ALERT_SOUND_CUSTOM_NAME_KEY = "fx-alert:alert-sound-custom-name";
export const ALERT_SOUND_DURATION_MS = 30_000;
export const SOUND_TRIGGER_RECENCY_MS = 3 * 60 * 1000;
/** @deprecated Merged into known trigger keys in notification center */
export const HEARD_SOUND_TRIGGERS_KEY = "fx-alert:heard-sound-triggers";
export const KNOWN_TRIGGER_KEYS_KEY = "fx-alert:known-trigger-keys";
export const LAST_VISIT_AT_KEY = "fx-alert:last-visit-at";
export const VISIT_BANNER_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const MAX_KNOWN_TRIGGER_KEYS = 500;

/** WAV sources tried first, then MP3. */
export const ALERT_SOUND_WAV_PATHS = [
  "/sounds/alert.wav",
  "/sounds/mixkit-bell-notification-933.wav",
] as const;

export const ALERT_SOUND_MP3_PATHS = ["/sounds/alert.mp3"] as const;

export const ALERT_SOUND_PATHS = [
  ...ALERT_SOUND_WAV_PATHS,
  ...ALERT_SOUND_MP3_PATHS,
] as const;

/** @deprecated Use ALERT_SOUND_PATHS — kept for compatibility */
export const ALERT_SOUND_PATH = ALERT_SOUND_PATHS[0];

const SOUND_DB_NAME = "fx-alert-sound";
const SOUND_DB_STORE = "custom-mp3";
const SOUND_DB_KEY = "file";
const MAX_CUSTOM_MP3_BYTES = 5 * 1024 * 1024;

export type AlertSoundMode = "default" | "custom";
export type SoundNotificationPermission =
  | "granted"
  | "denied"
  | "default"
  | "unsupported";

let audioInstance: HTMLAudioElement | null = null;
let resolvedSource: string | null = null;
let stopTimer: ReturnType<typeof setTimeout> | null = null;
let audioUnlocked = false;
let customObjectUrl: string | null = null;
const shownOsNotificationTags = new Set<string>();

/**
 * Unlocks browser audio playback after a user gesture (autoplay policy).
 * Safe to call multiple times.
 */
export async function unlockAlertAudio(): Promise<boolean> {
  if (typeof window === "undefined") {
    return false;
  }

  if (audioUnlocked) {
    return true;
  }

  try {
    const AudioContextCtor =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (AudioContextCtor) {
      const ctx = new AudioContextCtor();
      if (ctx.state === "suspended") {
        await ctx.resume();
      }
      await ctx.close();
    }

    const silent = new Audio(
      "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA=="
    );
    silent.volume = 0.01;
    await silent.play();
    silent.pause();
    silent.currentTime = 0;

    audioUnlocked = true;
    return true;
  } catch {
    return false;
  }
}

export function getNotificationPermission(): SoundNotificationPermission {
  if (typeof window === "undefined" || typeof Notification === "undefined") {
    return "unsupported";
  }
  return Notification.permission as "granted" | "denied" | "default";
}

/**
 * Unlocks HTML audio and requests browser Notification permission (user gesture).
 */
export async function requestSoundNotificationPermission(): Promise<SoundNotificationPermission> {
  await unlockAlertAudio();

  if (typeof window === "undefined" || typeof Notification === "undefined") {
    return "unsupported";
  }

  if (Notification.permission === "granted") {
    return "granted";
  }
  if (Notification.permission === "denied") {
    return "denied";
  }

  try {
    const result = await Notification.requestPermission();
    return result as "granted" | "denied" | "default";
  } catch {
    return "unsupported";
  }
}

export function showAlertOsNotification(options: {
  title: string;
  body: string;
  tag: string;
}): void {
  if (typeof window === "undefined" || typeof Notification === "undefined") {
    return;
  }
  if (Notification.permission !== "granted") {
    return;
  }
  if (shownOsNotificationTags.has(options.tag)) {
    return;
  }
  shownOsNotificationTags.add(options.tag);
  // Bound memory if many alerts fire in one session
  if (shownOsNotificationTags.size > 200) {
    const first = shownOsNotificationTags.values().next().value;
    if (first) shownOsNotificationTags.delete(first);
  }

  try {
    new Notification(options.title, {
      body: options.body,
      tag: options.tag,
      silent: false,
    });
  } catch {
    // Some browsers require a service worker for notifications
  }
}

export function isSoundAlertsEnabled(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(SOUND_ALERTS_ENABLED_KEY) === "true";
}

export function setSoundAlertsEnabled(enabled: boolean): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(SOUND_ALERTS_ENABLED_KEY, enabled ? "true" : "false");
}

export function getAlertSoundMode(): AlertSoundMode {
  if (typeof window === "undefined") {
    return "default";
  }
  return window.localStorage.getItem(ALERT_SOUND_MODE_KEY) === "custom" ? "custom" : "default";
}

export function setAlertSoundMode(mode: AlertSoundMode): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(ALERT_SOUND_MODE_KEY, mode);
}

export function getCustomAlertSoundFileName(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(ALERT_SOUND_CUSTOM_NAME_KEY);
}

function openSoundDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SOUND_DB_NAME, 1);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SOUND_DB_STORE)) {
        db.createObjectStore(SOUND_DB_STORE);
      }
    };
  });
}

function revokeCustomObjectUrl(): void {
  if (customObjectUrl) {
    URL.revokeObjectURL(customObjectUrl);
    customObjectUrl = null;
  }
}

function isMp3File(file: File): boolean {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return (
    name.endsWith(".mp3") ||
    type === "audio/mpeg" ||
    type === "audio/mp3" ||
    type === "audio/x-mpeg"
  );
}

export async function saveCustomAlertSound(file: File): Promise<void> {
  if (typeof window === "undefined") {
    throw new Error("Not available");
  }
  if (!isMp3File(file)) {
    throw new Error("Please choose an MP3 file");
  }
  if (file.size > MAX_CUSTOM_MP3_BYTES) {
    throw new Error("MP3 must be 5 MB or smaller");
  }

  const buffer = await file.arrayBuffer();
  const db = await openSoundDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SOUND_DB_STORE, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Failed to save sound"));
    tx.objectStore(SOUND_DB_STORE).put(
      { buffer, name: file.name, type: file.type || "audio/mpeg" },
      SOUND_DB_KEY,
    );
  });
  db.close();

  revokeCustomObjectUrl();
  window.localStorage.setItem(ALERT_SOUND_CUSTOM_NAME_KEY, file.name);
  setAlertSoundMode("custom");
}

export async function clearCustomAlertSound(): Promise<void> {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const db = await openSoundDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(SOUND_DB_STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Failed to clear sound"));
      tx.objectStore(SOUND_DB_STORE).delete(SOUND_DB_KEY);
    });
    db.close();
  } catch {
    // ignore
  }

  revokeCustomObjectUrl();
  window.localStorage.removeItem(ALERT_SOUND_CUSTOM_NAME_KEY);
  setAlertSoundMode("default");
}

type StoredCustomSound = {
  buffer: ArrayBuffer;
  name: string;
  type: string;
};

async function loadCustomSoundRecord(): Promise<StoredCustomSound | null> {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const db = await openSoundDb();
    const record = await new Promise<StoredCustomSound | null>((resolve, reject) => {
      const tx = db.transaction(SOUND_DB_STORE, "readonly");
      const req = tx.objectStore(SOUND_DB_STORE).get(SOUND_DB_KEY);
      req.onsuccess = () => {
        const value = req.result as StoredCustomSound | undefined;
        resolve(value?.buffer ? value : null);
      };
      req.onerror = () => reject(req.error ?? new Error("Failed to read sound"));
    });
    db.close();
    return record;
  } catch {
    return null;
  }
}

export async function getCustomAlertSoundObjectUrl(): Promise<string | null> {
  const record = await loadCustomSoundRecord();
  if (!record) {
    return null;
  }

  revokeCustomObjectUrl();
  const blob = new Blob([record.buffer], { type: record.type || "audio/mpeg" });
  customObjectUrl = URL.createObjectURL(blob);
  return customObjectUrl;
}

export async function hasCustomAlertSound(): Promise<boolean> {
  const record = await loadCustomSoundRecord();
  return Boolean(record);
}

export function stopAlertSound(): void {
  if (typeof window === "undefined") {
    return;
  }

  if (stopTimer) {
    clearTimeout(stopTimer);
    stopTimer = null;
  }

  if (audioInstance) {
    audioInstance.loop = false;
    audioInstance.pause();
    audioInstance.currentTime = 0;
  }
}

async function tryPlaySource(src: string, durationMs: number): Promise<boolean> {
  try {
    stopAlertSound();
    await unlockAlertAudio();

    const audio =
      resolvedSource === src && audioInstance ? audioInstance : new Audio(src);
    audio.loop = true;
    audio.currentTime = 0;
    await audio.play();
    audioInstance = audio;
    resolvedSource = src;

    stopTimer = setTimeout(() => {
      stopAlertSound();
    }, durationMs);

    return true;
  } catch {
    return false;
  }
}

/**
 * Plays the alert sound (custom MP3 if selected, else bundled paths).
 * Falls back to a Web Audio beep if no file loads.
 */
export async function playAlertSound(
  durationMs: number = ALERT_SOUND_DURATION_MS
): Promise<void> {
  if (typeof window === "undefined") {
    return;
  }

  if (getAlertSoundMode() === "custom") {
    const customUrl = await getCustomAlertSoundObjectUrl();
    if (customUrl && (await tryPlaySource(customUrl, durationMs))) {
      return;
    }
  }

  const sources = resolvedSource
    ? [resolvedSource, ...ALERT_SOUND_PATHS.filter((path) => path !== resolvedSource)]
    : [...ALERT_SOUND_PATHS];

  for (const src of sources) {
    if (src.startsWith("blob:")) {
      continue;
    }
    if (await tryPlaySource(src, durationMs)) {
      return;
    }
  }

  if (await playWebAudioFallback(durationMs)) {
    return;
  }

  resolvedSource = null;
  audioInstance = null;
}

async function playWebAudioFallback(durationMs: number): Promise<boolean> {
  try {
    await unlockAlertAudio();
    const AudioContextCtor =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextCtor) {
      return false;
    }

    const ctx = new AudioContextCtor();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 880;
    gain.gain.value = 0.15;
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();

    stopTimer = setTimeout(() => {
      oscillator.stop();
      void ctx.close();
      stopAlertSound();
    }, Math.min(durationMs, 3000));

    return true;
  } catch {
    return false;
  }
}

/** Short preview for Settings test button (~2s). */
export async function playAlertSoundPreview(): Promise<void> {
  await playAlertSound(2_000);
}
