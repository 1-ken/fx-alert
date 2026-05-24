export const SOUND_ALERTS_ENABLED_KEY = "fx-alert:sound-alerts-enabled";
export const ALERT_SOUND_DURATION_MS = 30_000;
export const SOUND_TRIGGER_RECENCY_MS = 3 * 60 * 1000;
export const HEARD_SOUND_TRIGGERS_KEY = "fx-alert:heard-sound-triggers";

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

let audioInstance: HTMLAudioElement | null = null;
let resolvedSource: string | null = null;
let stopTimer: ReturnType<typeof setTimeout> | null = null;
let audioUnlocked = false;

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

async function tryPlaySource(
  src: string,
  durationMs: number
): Promise<boolean> {
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
 * Plays the alert sound, trying bundled paths in order.
 * Falls back to a Web Audio beep if no file loads.
 */
export async function playAlertSound(
  durationMs: number = ALERT_SOUND_DURATION_MS
): Promise<void> {
  if (typeof window === "undefined") {
    return;
  }

  const sources = resolvedSource
    ? [resolvedSource, ...ALERT_SOUND_PATHS.filter((path) => path !== resolvedSource)]
    : [...ALERT_SOUND_PATHS];

  for (const src of sources) {
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
