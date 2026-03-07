import { Suspense } from "react";
import { LoginForm } from "@/components/login-form";

function LoginFormWrapper() {
  return (
    <div className="bg-muted flex min-h-svh flex-col items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm md:max-w-4xl">
        <LoginForm />
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="bg-muted flex min-h-svh flex-col items-center justify-center p-6 md:p-10">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      }
    >
      <LoginFormWrapper />
    </Suspense>
  );
}
