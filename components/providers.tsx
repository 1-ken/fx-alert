"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { FirebaseAuthSync } from "@/components/firebase-auth-sync";
import { BootstrapProvider } from "@/components/bootstrap-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider refetchInterval={30 * 60}>
      <ThemeProvider
        attribute="class"
        defaultTheme="light"
        enableSystem={false}
        disableTransitionOnChange
      >
        <BootstrapProvider>
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
    </SessionProvider>
  );
}
