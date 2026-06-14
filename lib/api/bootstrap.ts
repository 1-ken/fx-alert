import { Session } from "next-auth";

export interface DailyUsage {
  sms: number;
  smsLimit: number;
  calls: number;
  callsLimit: number;
}

export interface FreeTierLimits {
  maxAlerts: number;
  allowedChannels: string[];
}

export interface BootstrapData {
  userId: string;
  isFirstTimeUser: boolean;
  onboardingCompletedAt: string | null;
  authRequired: boolean;
  wsUrl: string;
  apiBaseUrl?: string;
  phone?: string | null;
  subscriptionTier?: string;
  trialStartedAt?: string | null;
  tourCompletedAt?: string | null;
  trialDaysRemaining?: number;
  trialExpired?: boolean;
  paywallRequired?: boolean;
  requiresPricingIntro?: boolean;
  dailyUsage?: DailyUsage;
  freeTierLimits?: FreeTierLimits;
}

/**
 * Fetch bootstrap data for the current user
 * Includes onboarding state and WebSocket/API configuration
 */
export async function getMe(session: Session | null): Promise<BootstrapData | null> {
  if (!session?.user?.id) {
    console.log("[getMe] No session provided");
    return null;
  }

  try {
    const token = (session as { accessToken?: string }).accessToken;

    console.log("[getMe] Fetching from:", "/api/bootstrap/me");
    console.log("[getMe] Authorization token present:", !!token);

    const response = await fetch("/api/bootstrap/me", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token || ""}`,
      },
      cache: "no-store",
    });

    console.log("[getMe] Response status:", response.status);

    if (!response.ok) {
      console.error("[getMe] Bootstrap fetch failed with status:", response.status);
      try {
        const errorData = await response.text();
        console.error("[getMe] Error response:", errorData);
      } catch {
        // Ignore error reading response body
      }
      return null;
    }

    const data = await response.json();
    console.log("[getMe] Successfully fetched bootstrap data");
    return data as BootstrapData;
  } catch (error) {
    console.error("[getMe] Exception during bootstrap fetch:", error);
    return null;
  }
}

export interface SaveUserPhoneResult {
  success: boolean;
  phone: string | null;
  error?: string;
}

/**
 * Save the user's phone number (Settings overwrites; alert create uses only_if_empty).
 */
export async function saveUserPhone(
  session: Session | null,
  phone: string,
  options?: { onlyIfEmpty?: boolean },
): Promise<SaveUserPhoneResult> {
  if (!session?.user?.id) {
    return { success: false, phone: null, error: "Not signed in" };
  }

  try {
    const token = (session as { accessToken?: string }).accessToken;
    const query = options?.onlyIfEmpty ? "?only_if_empty=true" : "";
    const response = await fetch(`/api/bootstrap/user/phone${query}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token || ""}`,
      },
      body: JSON.stringify({ phone: phone.trim() }),
      cache: "no-store",
    });

    if (!response.ok) {
      let error = "Failed to save phone number";
      try {
        const data = (await response.json()) as { detail?: string; error?: string };
        error = data.detail?.trim() || data.error?.trim() || error;
      } catch {
        // ignore parse errors
      }
      return { success: false, phone: null, error };
    }

    const data = (await response.json()) as { success?: boolean; phone?: string | null };
    return {
      success: data.success ?? true,
      phone: typeof data.phone === "string" ? data.phone : null,
    };
  } catch (error) {
    console.error("[saveUserPhone] failed:", error);
    return {
      success: false,
      phone: null,
      error: error instanceof Error ? error.message : "Failed to save phone number",
    };
  }
}

/**
 * Mark onboarding as complete for the current user
 */
export async function completeOnboarding(session: Session | null): Promise<boolean> {
  if (!session?.user?.id) {
    console.log("[completeOnboarding] No session provided");
    return false;
  }

  try {
    const token = (session as { accessToken?: string }).accessToken;

    console.log("[completeOnboarding] Posting to:", "/api/bootstrap/onboarding/complete");

    const response = await fetch("/api/bootstrap/onboarding/complete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token || ""}`,
      },
      cache: "no-store",
    });

    console.log("[completeOnboarding] Response status:", response.status);
    return response.ok;
  } catch (error) {
    console.error("[completeOnboarding] Exception:", error);
    return false;
  }
}

async function postBootstrapEndpoint(
  session: Session | null,
  path: string,
): Promise<BootstrapData | null> {
  if (!session?.user?.id) {
    return null;
  }

  try {
    const token = (session as { accessToken?: string }).accessToken;
    const response = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token || ""}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as BootstrapData;
  } catch (error) {
    console.error(`[bootstrap] POST ${path} failed:`, error);
    return null;
  }
}

/**
 * Mark the product tour as complete and start the 14-day trial.
 */
export async function completeTour(session: Session | null): Promise<BootstrapData | null> {
  return postBootstrapEndpoint(session, "/api/bootstrap/tour/complete");
}

/**
 * Dismiss the post-trial paywall upsell.
 */
export async function dismissPaywall(session: Session | null): Promise<BootstrapData | null> {
  return postBootstrapEndpoint(session, "/api/bootstrap/subscription/dismiss-paywall");
}

/**
 * Select a subscription tier (paid tiers return coming_soon for now).
 */
export async function selectSubscriptionTier(
  session: Session | null,
  tier: string,
): Promise<BootstrapData | null> {
  if (!session?.user?.id) {
    return null;
  }

  try {
    const token = (session as { accessToken?: string }).accessToken;
    const response = await fetch("/api/bootstrap/subscription/select-tier", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token || ""}`,
      },
      body: JSON.stringify({ tier }),
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as BootstrapData;
  } catch (error) {
    console.error("[selectSubscriptionTier] failed:", error);
    return null;
  }
}
