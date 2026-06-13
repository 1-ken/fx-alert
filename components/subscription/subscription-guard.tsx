"use client";

import { useBootstrap } from "@/components/bootstrap-provider";
import { PaywallModal } from "@/components/subscription/paywall-modal";

export function SubscriptionGuard({ children }: { children: React.ReactNode }) {
  const { bootstrap, isBootstrapBlocking } = useBootstrap();
  const paywallOpen = !isBootstrapBlocking && bootstrap?.paywallRequired === true;

  return (
    <>
      {children}
      <PaywallModal open={paywallOpen} />
    </>
  );
}
