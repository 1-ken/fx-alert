"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { FirebaseAuthSync } from "@/components/firebase-auth-sync";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider
        attribute="class"
        defaultTheme="light"
        enableSystem={false}
        disableTransitionOnChange
      >
        <FirebaseAuthSync />
        {children}
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
