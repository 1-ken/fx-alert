"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import { SWRConfig } from "swr";
import { Toaster } from "sonner";
import { FirebaseAuthSync } from "@/components/firebase-auth-sync";
import { BootstrapProvider } from "@/components/bootstrap-provider";
import { ReferralClaimer } from "@/components/referral-claimer";
import { SWR_DEFAULT_OPTIONS } from "@/lib/swr-config";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider refetchInterval={30 * 60} refetchOnWindowFocus={false}>
      <SWRConfig value={SWR_DEFAULT_OPTIONS}>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          <BootstrapProvider>
            <ReferralClaimer />
            <FirebaseAuthSync />
            {children}
          </BootstrapProvider>
          <Toaster
            position="top-right"
            richColors
            closeButton
            expand={true}
            duration={4000}
          />
        </ThemeProvider>
      </SWRConfig>
    </SessionProvider>
  );
}
