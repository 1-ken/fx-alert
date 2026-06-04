"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { completeOnboarding } from "@/lib/api/bootstrap";
import { useBootstrap } from "@/components/bootstrap-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BellAlertIcon, CheckCircleIcon, SparklesIcon } from "@heroicons/react/24/outline";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";

type OnboardingStep = "welcome" | "features" | "success";

export function OnboardingPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const { refetch: refetchBootstrap } = useBootstrap();
  const [currentStep, setCurrentStep] = useState<OnboardingStep>("welcome");
  const [isLoading, setIsLoading] = useState(false);

  const handleNext = () => {
    if (currentStep === "welcome") {
      setCurrentStep("features");
    } else if (currentStep === "features") {
      handleComplete();
    }
  };

  const handleComplete = async () => {
    if (!session?.user?.id) {
      toast.error("Not authenticated");
      return;
    }

    setIsLoading(true);

    try {
      const success = await completeOnboarding(session);
      if (success) {
        console.log("[OnboardingPage] Onboarding completed successfully, refetching bootstrap...");
        
        // Refetch bootstrap to update context with new onboarding state
        await refetchBootstrap();
        
        setCurrentStep("success");
        // Redirect after a short delay to show success screen
        setTimeout(() => {
          router.push("/dashboard");
        }, 1500);
      } else {
        toast.error("Failed to complete onboarding");
      }
    } catch (error) {
      toast.error("An error occurred during onboarding");
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  if (currentStep === "welcome") {
    return (
      <div className="min-h-screen bg-linear-to-br from-blue-50 to-indigo-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-4">
        <Card className="max-w-md w-full shadow-lg">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="bg-blue-100 dark:bg-blue-900 p-4 rounded-full">
                <SparklesIcon className="h-8 w-8 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
            <CardTitle className="text-2xl">Welcome to FX Alert</CardTitle>
            <CardDescription>
              Your real-time forex market monitoring companion
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4 text-sm text-muted-foreground">
              <p>
                Get instant notifications when forex pairs reach your target prices. Monitor multiple
                currency pairs and set custom alerts for optimal trading opportunities.
              </p>
              <p>
                Let&apos;s get you set up in just a few seconds.
              </p>
            </div>
            <Button
              onClick={handleNext}
              className="w-full"
              disabled={isLoading}
            >
              Get Started
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              Step 1 of 2
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (currentStep === "features") {
    return (
      <div className="min-h-screen bg-linear-to-br from-blue-50 to-indigo-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-4">
        <Card className="max-w-md w-full shadow-lg">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Key Features</CardTitle>
            <CardDescription>
              What you can do with FX Alert
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              {[
                {
                  icon: BellAlertIcon,
                  title: "Real-Time Alerts",
                  description: "Get notified instantly when prices hit your targets",
                },
                {
                  icon: CheckCircleIcon,
                  title: "Multiple Pairs",
                  description: "Monitor major forex pairs and commodities 24/5",
                },
              ].map((feature) => {
                const Icon = feature.icon;
                return (
                  <div key={feature.title} className="flex gap-3">
                    <div className="shrink-0">
                      <Icon className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-1" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{feature.title}</p>
                      <p className="text-xs text-muted-foreground">{feature.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="space-y-3">
              <Button
                onClick={handleNext}
                className="w-full"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Spinner className="h-4 w-4 mr-2" />
                    Completing...
                  </>
                ) : (
                  "Complete Onboarding"
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => setCurrentStep("welcome")}
                className="w-full"
                disabled={isLoading}
              >
                Back
              </Button>
            </div>
            <p className="text-xs text-center text-muted-foreground">
              Step 2 of 2
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (currentStep === "success") {
    return (
      <div className="min-h-screen bg-linear-to-br from-green-50 to-emerald-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-4">
        <Card className="max-w-md w-full shadow-lg">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="bg-green-100 dark:bg-green-900 p-4 rounded-full">
                <CheckCircleIcon className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
            </div>
            <CardTitle className="text-2xl">All Set!</CardTitle>
            <CardDescription>
              Your account is ready to go
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-center text-sm text-muted-foreground">
              You&apos;re all configured and ready to start monitoring forex markets. Redirecting you to the dashboard...
            </p>
            <div className="flex justify-center">
              <Spinner className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return null;
}
