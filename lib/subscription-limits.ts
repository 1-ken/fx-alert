import type { BootstrapData } from "@/lib/api/bootstrap";
import { FREE_MAX_ALERTS, TRIAL_CALL_LIMIT, TRIAL_SMS_LIMIT } from "@/lib/pricing";

export interface ChannelLimitState {
  disabled: boolean;
  reason?: string;
}

export function getChannelLimitState(
  channel: "sms" | "call" | "sound" | "email",
  bootstrap: BootstrapData | null | undefined,
): ChannelLimitState {
  const tier = bootstrap?.subscriptionTier ?? "none";

  if (bootstrap?.requiresPricingIntro && (channel === "sms" || channel === "call")) {
    return {
      disabled: true,
      reason: "Complete the product tour to start your free trial.",
    };
  }

  if (channel === "sound") {
    return { disabled: false };
  }

  if (tier === "free") {
    return {
      disabled: true,
      reason: "Free plan supports sound alerts only. Upgrade in Settings.",
    };
  }

  if (tier === "none" && (channel === "sms" || channel === "call")) {
    return {
      disabled: true,
      reason: bootstrap?.onboardingCompletedAt
        ? "Complete the product tour to start your free trial."
        : "Complete onboarding to activate your free trial.",
    };
  }

  if (tier === "trial") {
    const usage = bootstrap?.dailyUsage;
    if (channel === "sms" && usage && usage.sms >= (usage.smsLimit ?? TRIAL_SMS_LIMIT)) {
      return {
        disabled: true,
        reason: "Daily SMS limit reached (resets midnight UTC).",
      };
    }
    if (channel === "call" && usage && usage.calls >= (usage.callsLimit ?? TRIAL_CALL_LIMIT)) {
      return {
        disabled: true,
        reason: "Daily call limit reached (resets midnight UTC).",
      };
    }
  }

  return { disabled: false };
}

export function canCreateMoreAlerts(
  bootstrap: BootstrapData | null | undefined,
  activeAlertCount: number,
): { allowed: boolean; reason?: string } {
  const tier = bootstrap?.subscriptionTier ?? "none";
  const maxAlerts = bootstrap?.freeTierLimits?.maxAlerts ?? FREE_MAX_ALERTS;

  if (tier === "free" && activeAlertCount >= maxAlerts) {
    return {
      allowed: false,
      reason: `Free plan allows up to ${maxAlerts} active alerts. Upgrade in Settings.`,
    };
  }

  return { allowed: true };
}
