import { Session } from "next-auth";

export interface BootstrapData {
  userId: string;
  isFirstTimeUser: boolean;
  onboardingCompletedAt: string | null;
  authRequired: boolean;
  wsUrl: string;
  apiBaseUrl?: string;
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
      } catch (e) {
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
