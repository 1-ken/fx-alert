/** East Africa Time — UTC+3 year-round. */
export const DISPLAY_TIMEZONE = "Africa/Nairobi";
const KENYA_TIMEZONE = DISPLAY_TIMEZONE;
const KENYA_LOCALE = "en-KE";

/**
 * Formats an ISO timestamp for display in Kenyan local time.
 */
export function formatKenyaDateTime(isoDate: string | null | undefined): string {
  if (!isoDate) {
    return "—";
  }

  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat(KENYA_LOCALE, {
    timeZone: KENYA_TIMEZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

/**
 * Compact date+time in Kenyan local time, e.g. "12 Mar 2026, 12:05".
 */
export function formatKenyaCompactDateTime(
  isoDate: string | null | undefined,
): string {
  if (!isoDate) {
    return "—";
  }

  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: KENYA_TIMEZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/**
 * Formats only the time portion in Kenyan local time.
 */
export function formatKenyaTime(isoDate: string | null | undefined): string {
  if (!isoDate) {
    return "—";
  }

  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat(KENYA_LOCALE, {
    timeZone: KENYA_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

/**
 * Relative time label (e.g. "45s ago") with fallback to Kenya local time.
 */
export function formatKenyaRelative(isoDate: string | null | undefined): string {
  if (!isoDate) {
    return "No update yet";
  }

  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return "No update yet";
  }

  const milliseconds = Date.now() - date.getTime();
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));

  if (seconds < 60) {
    return `${seconds}s ago`;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  return formatKenyaTime(isoDate);
}
