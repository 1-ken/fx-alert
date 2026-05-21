export const SOUND_ALERTS_ENABLED_KEY = "fx-alert:sound-alerts-enabled";
export const ALERT_SOUND_DURATION_MS = 30_000;

/** WAV sources tried first, then MP3. */
export const ALERT_SOUND_WAV_PATHS = [
  "/sounds/mixkit-bell-notification-933.wav",
  "/sounds/alert.wav",
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

  resolvedSource = null;
  audioInstance = null;
}
