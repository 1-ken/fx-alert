export const REFERRAL_STORAGE_KEY = "fx_referral";

const MARKETER_CODE_PATTERN = /^[a-z0-9_]{3,32}$/;

export function normalizeReferralCode(code: string): string | null {
  const normalized = code.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
  if (!MARKETER_CODE_PATTERN.test(normalized)) {
    return null;
  }
  return normalized;
}

export function persistReferralCode(code: string): void {
  if (typeof window === "undefined") {
    return;
  }
  const normalized = normalizeReferralCode(code);
  if (!normalized) {
    return;
  }
  window.sessionStorage.setItem(REFERRAL_STORAGE_KEY, normalized);
}

export function readReferralCode(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  const stored = window.sessionStorage.getItem(REFERRAL_STORAGE_KEY);
  if (!stored) {
    return null;
  }
  return normalizeReferralCode(stored);
}

export function clearReferralCode(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.removeItem(REFERRAL_STORAGE_KEY);
}

export function buildMarketerReferralLink(origin: string, code: string): string {
  const url = new URL("/login", origin);
  url.searchParams.set("tab", "register");
  url.searchParams.set("ref", code);
  return url.toString();
}
