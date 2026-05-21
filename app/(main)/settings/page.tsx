"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeftIcon, Cog6ToothIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  isSoundAlertsEnabled,
  setSoundAlertsEnabled,
  SOUND_ALERTS_ENABLED_KEY,
  ALERT_SOUND_WAV_PATHS,
  ALERT_SOUND_MP3_PATHS,
} from "@/lib/alert-sound";

const ALERT_DEFAULT_PHONE_STORAGE_KEY = "fx-alert:default-sms-phone";

export default function SettingsPage() {
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

  const handleSoundToggle = (enabled: boolean) => {
    setSoundAlertsEnabled(enabled);
    setSoundAlertsEnabledState(enabled);
    toast.success(enabled ? "Sound alerts enabled" : "Sound alerts disabled");
  };

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
          <CardTitle>Sound Alerts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Play a looping sound in the browser for 30 seconds when a sound-channel alert triggers.
            Uses WAV first, then MP3:
          </p>
          <ul className="list-inside list-disc text-xs text-muted-foreground">
            {ALERT_SOUND_WAV_PATHS.map((path) => (
              <li key={path}>
                <code>{path}</code>
              </li>
            ))}
            {ALERT_SOUND_MP3_PATHS.map((path) => (
              <li key={path}>
                <code>{path}</code>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between rounded-lg border px-3 py-3">
            <div>
              <p className="text-sm font-medium">Enable sound alerts</p>
              <p className="text-xs text-muted-foreground">
                Stored locally ({SOUND_ALERTS_ENABLED_KEY})
              </p>
            </div>
            <Switch checked={soundAlertsEnabled} onCheckedChange={handleSoundToggle} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Default SMS Number</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            This number pre-fills the phone field when creating SMS alerts. You can still edit it per
            alert.
          </p>
          <Input
            value={phoneNumber}
            onChange={(event) => setPhoneNumber(event.target.value)}
            placeholder="e.g. +254700000000"
            className="h-12"
          />
          <Button className="h-11" onClick={savePhoneNumber}>
            Save Number
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
