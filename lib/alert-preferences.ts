/** Default phone for SMS/call alerts (localStorage). */
export const ALERT_DEFAULT_PHONE_STORAGE_KEY = "fx-alert:default-sms-phone";

/** Default extra notify channel. Sound means in-app only. */
export const ALERT_DEFAULT_NOTIFY_CHANNEL_STORAGE_KEY = "fx-alert:default-notify-channel";

export type DefaultNotifyChannel = "sound" | "sms" | "call" | "email";

export function isDefaultNotifyChannel(value: string | null): value is DefaultNotifyChannel {
  return value === "sound" || value === "sms" || value === "call" || value === "email";
}

export function getDefaultNotifyChannel(): DefaultNotifyChannel | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(ALERT_DEFAULT_NOTIFY_CHANNEL_STORAGE_KEY);
  return isDefaultNotifyChannel(raw) ? raw : null;
}

export function setDefaultNotifyChannel(channel: DefaultNotifyChannel): void {
  window.localStorage.setItem(ALERT_DEFAULT_NOTIFY_CHANNEL_STORAGE_KEY, channel);
}

export function defaultNotifyLabel(channel: DefaultNotifyChannel): string {
  switch (channel) {
    case "sms":
      return "SMS";
    case "call":
      return "Call";
    case "email":
      return "Email";
    default:
      return "In-app sound";
  }
}

/** Max custom message length for SMS, sound, and email alerts. */
export const CUSTOM_MESSAGE_MAX_CHARS = 500;

/** Max custom message for call alerts (~1 minute TTS at ~130 wpm). */
export const CALL_CUSTOM_MESSAGE_MAX_CHARS = 600;

export function getCustomMessageMaxChars(channel: "sms" | "call" | "sound" | "email"): number {
  return channel === "call" ? CALL_CUSTOM_MESSAGE_MAX_CHARS : CUSTOM_MESSAGE_MAX_CHARS;
}
