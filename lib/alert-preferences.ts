/** Default phone for SMS/call alerts (localStorage). */
export const ALERT_DEFAULT_PHONE_STORAGE_KEY = "fx-alert:default-sms-phone";

/** Max custom message length for SMS, sound, and email alerts. */
export const CUSTOM_MESSAGE_MAX_CHARS = 500;

/** Max custom message for call alerts (~1 minute TTS at ~130 wpm). */
export const CALL_CUSTOM_MESSAGE_MAX_CHARS = 600;

export function getCustomMessageMaxChars(channel: "sms" | "call" | "sound" | "email"): number {
  return channel === "call" ? CALL_CUSTOM_MESSAGE_MAX_CHARS : CUSTOM_MESSAGE_MAX_CHARS;
}
