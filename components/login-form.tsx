"use client";

import { useState, useEffect } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import Image from "next/image";
import {
  FieldGroup,
} from "@/components/ui/field";

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";
  const { data: session, status } = useSession();

  // Redirect authenticated users away from login page
  useEffect(() => {
    if (status === "authenticated" && session) {
      router.push(callbackUrl);
    }
  }, [status, session, router, callbackUrl]);

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    try {
      await signIn("google", {
        callbackUrl,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="overflow-hidden p-0">
        <CardContent className="grid p-0 md:grid-cols-2">
          <div className="bg-muted relative hidden md:block md:min-h-140 md:shrink-0">
            <Image
              src="/assets/fxlogo.png"
              alt="fx-alert Background"
              fill
              sizes="50vw"
              className="object-cover dark:brightness-[0.2] dark:grayscale"
              unoptimized
            />
          </div>
          <div className="flex flex-col items-center w-full">
            {/* The Logo Container */}
            <div className="relative w-32 h-32 shrink-0">
              <Image
                src="/assets/fxlogo.webp"
                alt="fx-alert Logo"
                fill
                sizes="32px"
                className="object-contain"
                unoptimized
              />
            </div>

            {/* The Form */}
            <div className="w-full">
              <div className="p-6 md:p-8">
                <FieldGroup>
                  <div className="flex flex-col items-center gap-1 text-center">
                    <h1 className="text-2xl font-bold">Welcome</h1>
                    <p className="text-muted-foreground text-sm text-balance">
                      Continue with your Google account
                    </p>
                  </div>
                  <Button onClick={handleGoogleSignIn} disabled={isLoading}>
                    {isLoading ? "Please wait..." : "Continue with Google"}
                  </Button>
                </FieldGroup>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
