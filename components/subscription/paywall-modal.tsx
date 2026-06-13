"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PricingTable } from "@/components/subscription/pricing-table";
import { useBootstrap } from "@/components/bootstrap-provider";
import { dismissPaywall, selectSubscriptionTier } from "@/lib/api/bootstrap";
import type { SubscriptionTier } from "@/lib/pricing";

interface PaywallModalProps {
  open: boolean;
}

export function PaywallModal({ open }: PaywallModalProps) {
  const { data: session } = useSession();
  const { bootstrap, refetch } = useBootstrap();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && bootstrap?.paywallRequired) {
      void handleContinueFree();
    }
  };

  const handleContinueFree = async () => {
    setIsSubmitting(true);
    try {
      await dismissPaywall(session);
      await refetch();
      toast.success("You are on the Free plan (5 sound alerts)");
    } catch {
      toast.error("Could not update your plan");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSelectTier = async (tier: SubscriptionTier) => {
    if (tier === "free") {
      await handleContinueFree();
      return;
    }
    toast.message("M-Pesa payments coming soon");
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Your free trial has ended</DialogTitle>
          <DialogDescription>
            Upgrade for SMS and call alerts, or continue on the Free plan with sound alerts only.
          </DialogDescription>
        </DialogHeader>

        <PricingTable bootstrap={bootstrap} onSelectTier={handleSelectTier} />

        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            disabled={isSubmitting}
            onClick={() => void handleContinueFree()}
          >
            Continue on Free
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface PlanPricingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PlanPricingDialog({ open, onOpenChange }: PlanPricingDialogProps) {
  const { data: session } = useSession();
  const { bootstrap, refetch } = useBootstrap();

  const handleSelectTier = async (tier: SubscriptionTier) => {
    if (tier !== "free") {
      toast.message("M-Pesa payments coming soon");
      return;
    }
    await selectSubscriptionTier(session, tier);
    await refetch();
    toast.success("Free plan selected");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Plan & pricing</DialogTitle>
          <DialogDescription>
            Compare plans and see how many trial days you have left.
          </DialogDescription>
        </DialogHeader>
        <PricingTable bootstrap={bootstrap} onSelectTier={handleSelectTier} />
      </DialogContent>
    </Dialog>
  );
}
