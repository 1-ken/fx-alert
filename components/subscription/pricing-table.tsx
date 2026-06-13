"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  PRICING_TIERS,
  TOP_UP_PACKS,
  type SubscriptionTier,
  tierDisplayName,
} from "@/lib/pricing";
import type { BootstrapData } from "@/lib/api/bootstrap";

interface PricingTableProps {
  bootstrap?: BootstrapData | null;
  currentTier?: string;
  showTrialStatus?: boolean;
  onSelectTier?: (tier: SubscriptionTier) => void | Promise<void>;
  compact?: boolean;
}

function trialStatusLabel(bootstrap?: BootstrapData | null): string {
  const tier = bootstrap?.subscriptionTier ?? "none";
  if (tier === "trial") {
    const days = bootstrap?.trialDaysRemaining ?? 0;
    return days > 0
      ? `${days} day${days === 1 ? "" : "s"} left in your free trial`
      : "Trial ending today";
  }
  if (tier === "free" && bootstrap?.trialExpired) {
    return "Trial ended — you are on the Free plan";
  }
  if (tier === "none") {
    if (bootstrap?.requiresPricingIntro) {
      return "Complete the tour to start your trial";
    }
    return "Complete onboarding to start your 14-day trial";
  }
  return `Current plan: ${tierDisplayName(tier)}`;
}

export function PricingTable({
  bootstrap,
  currentTier,
  showTrialStatus = true,
  onSelectTier,
  compact = false,
}: PricingTableProps) {
  const activeTier = currentTier ?? bootstrap?.subscriptionTier ?? "none";
  const dailyUsage = bootstrap?.dailyUsage;

  return (
    <div className="space-y-6">
      {showTrialStatus ? (
        <div className="rounded-lg border bg-muted/30 px-4 py-3">
          <p className="text-sm font-medium">{trialStatusLabel(bootstrap)}</p>
          {activeTier === "trial" && dailyUsage ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Today: {dailyUsage.sms}/{dailyUsage.smsLimit} SMS · {dailyUsage.calls}/
              {dailyUsage.callsLimit} calls (resets midnight UTC)
            </p>
          ) : null}
        </div>
      ) : null}

      <div className={cn("grid gap-3", compact ? "grid-cols-1" : "sm:grid-cols-2")}>
        {PRICING_TIERS.map((tier) => {
          const isCurrent = activeTier === tier.id;
          const isPaid = tier.id !== "free";

          return (
            <div
              key={tier.id}
              className={cn(
                "flex flex-col rounded-xl border p-4",
                tier.highlight ? "border-primary/50 bg-primary/5" : "bg-card",
                isCurrent && "ring-2 ring-primary/40",
              )}
            >
              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{tier.name}</p>
                  <p className="text-sm text-muted-foreground">{tier.priceLabel}</p>
                </div>
                {isCurrent ? (
                  <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
                    Current
                  </span>
                ) : null}
              </div>
              <p className="mb-4 flex-1 text-sm text-muted-foreground">{tier.includes}</p>
              {onSelectTier && !isCurrent ? (
                <Button
                  type="button"
                  variant={tier.highlight ? "default" : "outline"}
                  className="w-full"
                  onClick={() => {
                    if (isPaid) {
                      toast.message("M-Pesa payments coming soon");
                      return;
                    }
                    void onSelectTier(tier.id);
                  }}
                >
                  {tier.id === "free" ? "Continue on Free" : "Subscribe"}
                </Button>
              ) : null}
            </div>
          );
        })}
      </div>

      {!compact ? (
        <div className="space-y-3">
          <p className="text-sm font-medium">Top-ups (coming soon)</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {TOP_UP_PACKS.map((pack) => (
              <div key={pack.id} className="rounded-lg border px-3 py-2 text-sm">
                <p className="font-medium">
                  {pack.name} · KES {pack.priceKes.toLocaleString("en-KE")}
                </p>
                <p className="text-muted-foreground">{pack.contents}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
