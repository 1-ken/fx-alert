"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeftIcon, Cog6ToothIcon, CreditCardIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  isSoundAlertsEnabled,
  playAlertSoundPreview,
  setSoundAlertsEnabled,
  unlockAlertAudio,  
} from "@/lib/alert-sound";
import { ALERT_DEFAULT_PHONE_STORAGE_KEY } from "@/lib/alert-preferences";
import { logoutUser } from "@/lib/auth-client";
import { useBootstrap } from "@/components/bootstrap-provider";
import { PlanPricingDialog } from "@/components/subscription/paywall-modal";
import { tierDisplayName } from "@/lib/pricing";

export default function SettingsPage() {
  const { bootstrap } = useBootstrap();
  const [pricingOpen, setPricingOpen] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState(() => {
    if (typeof window === "undefined") {
      return "";
    }

    return window.localStorage.getItem(ALERT_DEFAULT_PHONE_STORAGE_KEY) ?? "";
  });

  const [soundAlertsEnabled, setSoundAlertsEnabledState] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return isSoundAlertsEnabled();
  });

  const savePhoneNumber = () => {
    window.localStorage.setItem(ALERT_DEFAULT_PHONE_STORAGE_KEY, phoneNumber.trim());
    toast.success("Default alert phone number saved");
  };

  const handleSoundToggle = async (enabled: boolean) => {
    if (enabled) {
      await unlockAlertAudio();
    }
    setSoundAlertsEnabled(enabled);
    setSoundAlertsEnabledState(enabled);
    toast.success(enabled ? "Sound alerts enabled" : "Sound alerts disabled");
  };

  const handleTestSound = async () => {
    await unlockAlertAudio();
    try {
      await playAlertSoundPreview();
      toast.success("Playing test sound");
    } catch {
      toast.error("Could not play sound — check browser permissions");
    }
  };

  const tier = bootstrap?.subscriptionTier ?? "none";
  const trialDays = bootstrap?.trialDaysRemaining ?? 0;
  const planSummary =
    tier === "trial"
      ? `${trialDays} day${trialDays === 1 ? "" : "s"} left in free trial`
      : tier === "free" && bootstrap?.trialExpired
        ? "Trial ended — Free plan"
        : tier === "none"
          ? bootstrap?.requiresPricingIntro
            ? "Complete the tour to start your trial"
            : "Complete onboarding to start your trial"
          : tierDisplayName(tier);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-4 px-4 py-8">
      <header className="rounded-xl border bg-card/80 p-4">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon" className="h-10 w-10">
            <Link href="/dashboard" aria-label="Back to dashboard">
              <ArrowLeftIcon className="h-5 w-5" />
            </Link>
          </Button>
          <div className="rounded-xl bg-primary/15 p-2.5 text-primary">
            <Cog6ToothIcon className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Settings</h1>
            <p className="text-sm text-muted-foreground">
              Configure defaults for alerts and notifications.
            </p>
          </div>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Plan & pricing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-3 rounded-lg border px-3 py-3">
            <div className="rounded-lg bg-primary/15 p-2 text-primary">
              <CreditCardIcon className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">{planSummary}</p>
              {tier === "trial" && bootstrap?.dailyUsage ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Today: {bootstrap.dailyUsage.sms}/{bootstrap.dailyUsage.smsLimit} SMS ·{" "}
                  {bootstrap.dailyUsage.calls}/{bootstrap.dailyUsage.callsLimit} calls
                </p>
              ) : null}
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full"
            onClick={() => setPricingOpen(true)}
          >
            View plans & pricing
          </Button>
        </CardContent>
      </Card>

      <PlanPricingDialog open={pricingOpen} onOpenChange={setPricingOpen} />

      <Card>
        <CardHeader>
          <CardTitle>Sound Alerts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Play a looping sound in the browser for 30 seconds when a sound-channel alert triggers.
          </p>
          
          <div className="flex items-center justify-between rounded-lg border px-3 py-3">
            <div>
              <p className="text-sm font-medium">Enable sound alerts</p>              
            </div>
            <Switch checked={soundAlertsEnabled} onCheckedChange={handleSoundToggle} />
          </div>
          <Button type="button" variant="outline" className="h-11 w-full" onClick={handleTestSound}>
            Test sound
          </Button>
        </CardContent>
      </Card>

      <Card data-tour="settings-default-phone" className="scroll-mt-24">
        <CardHeader>
          <CardTitle>Default alert phone</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            This number pre-fills the phone field when creating SMS and call alerts. You can still edit
            it per alert.
          </p>
          <Input
            value={phoneNumber}
            onChange={(event) => setPhoneNumber(event.target.value)}
            placeholder="e.g. +254700000000"
            className="h-12"
          />
          <Button className="h-11 w-full" onClick={savePhoneNumber}>
            Save Number
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-muted-foreground">
            Sign out of FX Alert on this device.
          </p>
          <Button
            type="button"
            variant="destructive"
            className="h-11 w-full"
            onClick={() => void logoutUser("/login")}
          >
            Log out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
