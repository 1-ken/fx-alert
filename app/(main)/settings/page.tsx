"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";
import {
  ArrowLeftIcon,
  BellAlertIcon,
  BellSlashIcon,
  CalendarDaysIcon,
  ClockIcon,
  Cog6ToothIcon,
  CreditCardIcon,
  PauseIcon,
  PlayIcon,
} from "@heroicons/react/24/outline";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  clearCustomAlertSound,
  getAlertSoundMode,
  getCustomAlertSoundFileName,
  getNotificationPermission,
  hasCustomAlertSound,
  isSoundAlertsEnabled,
  playAlertSoundPreview,
  requestSoundNotificationPermission,
  saveCustomAlertSound,
  setAlertSoundMode,
  setSoundAlertsEnabled,
  type AlertSoundMode,
} from "@/lib/alert-sound";
import {
  ALERT_DEFAULT_PHONE_STORAGE_KEY,
  defaultNotifyLabel,
  getDefaultNotifyChannel,
  setDefaultNotifyChannel,
  type DefaultNotifyChannel,
} from "@/lib/alert-preferences";
import { logoutUser } from "@/lib/auth-client";
import { useBootstrap } from "@/components/bootstrap-provider";
import { PlanPricingDialog } from "@/components/subscription/paywall-modal";
import { tierDisplayName } from "@/lib/pricing";
import { saveAlertDeliverySettings, saveUserPhone } from "@/lib/api/bootstrap";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
  const { data: session } = useSession();
  const { bootstrap, refetch } = useBootstrap();
  const [pricingOpen, setPricingOpen] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [defaultChannel, setDefaultChannel] = useState<DefaultNotifyChannel>("sound");
  const [isSavingPhone, setIsSavingPhone] = useState(false);
  const [phoneInitialized, setPhoneInitialized] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [alertsPaused, setAlertsPaused] = useState(false);
  const [pauseUntil, setPauseUntil] = useState<string | null>(null);
  const [isSavingPause, setIsSavingPause] = useState(false);

  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("22:00");
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([1, 2, 3, 4, 5]);
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);
  const [deliveryInitialized, setDeliveryInitialized] = useState(false);

  useEffect(() => {
    if (deliveryInitialized) {
      return;
    }

    if (bootstrap?.alertDelivery) {
      const ad = bootstrap.alertDelivery;
      setAlertsPaused(ad.effectivelyPaused);
      setPauseUntil(ad.alertsPausedUntil ?? null);
      setScheduleEnabled(ad.scheduleEnabled);
      setStartTime(ad.startTime || "08:00");
      setEndTime(ad.endTime || "22:00");
      setDaysOfWeek(ad.daysOfWeek && ad.daysOfWeek.length > 0 ? ad.daysOfWeek : [1, 2, 3, 4, 5]);
      setDeliveryInitialized(true);
      return;
    }

    if (bootstrap !== null) {
      setDeliveryInitialized(true);
    }
  }, [bootstrap, deliveryInitialized]);

  useEffect(() => {
    if (phoneInitialized) {
      return;
    }

    const serverPhone = bootstrap?.phone?.trim();
    if (serverPhone) {
      setPhoneNumber(serverPhone);
      window.localStorage.setItem(ALERT_DEFAULT_PHONE_STORAGE_KEY, serverPhone);
      setPhoneInitialized(true);
      return;
    }

    if (bootstrap !== null) {
      const savedPhone = window.localStorage.getItem(ALERT_DEFAULT_PHONE_STORAGE_KEY)?.trim();
      if (savedPhone) {
        setPhoneNumber(savedPhone);
      }
      setPhoneInitialized(true);
    }
  }, [bootstrap, phoneInitialized]);

  useEffect(() => {
    const saved = getDefaultNotifyChannel();
    if (saved) setDefaultChannel(saved);
  }, []);

  const [soundAlertsEnabled, setSoundAlertsEnabledState] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return isSoundAlertsEnabled();
  });

  const [soundMode, setSoundModeState] = useState<AlertSoundMode>(() => {
    if (typeof window === "undefined") {
      return "default";
    }
    return getAlertSoundMode();
  });

  const [customFileName, setCustomFileName] = useState<string | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }
    return getCustomAlertSoundFileName();
  });

  const [notifPermission, setNotifPermission] = useState(() => {
    if (typeof window === "undefined") {
      return "unsupported" as const;
    }
    return getNotificationPermission();
  });

  useEffect(() => {
    void hasCustomAlertSound().then((exists) => {
      if (!exists && getAlertSoundMode() === "custom") {
        setAlertSoundMode("default");
        setSoundModeState("default");
      }
    });
  }, []);

  const savePhoneNumber = async () => {
    const trimmed = phoneNumber.trim();
    const needsPhone = defaultChannel === "sms" || defaultChannel === "call";
    if (needsPhone && !trimmed) {
      toast.error("Enter a phone number for SMS or call alerts");
      return;
    }

    setIsSavingPhone(true);
    try {
      setDefaultNotifyChannel(defaultChannel);
      if (trimmed) {
        const result = await saveUserPhone(session, trimmed);
        if (!result.success) {
          toast.error(result.error ?? "Failed to save phone number");
          return;
        }
        const saved = result.phone?.trim() || trimmed;
        window.localStorage.setItem(ALERT_DEFAULT_PHONE_STORAGE_KEY, saved);
        setPhoneNumber(saved);
        await refetch();
      }
      toast.success(`Default alert method saved: ${defaultNotifyLabel(defaultChannel)}`);
    } finally {
      setIsSavingPhone(false);
    }
  };

  const handleSoundToggle = async (enabled: boolean) => {
    if (enabled) {
      const permission = await requestSoundNotificationPermission();
      setNotifPermission(permission);
      setSoundAlertsEnabled(true);
      setSoundAlertsEnabledState(true);
      if (permission === "granted") {
        toast.success("Sound alerts enabled — notifications allowed");
      } else if (permission === "denied") {
        toast.success(
          "Sound alerts enabled. Allow notifications in browser settings for background alerts.",
        );
      } else if (permission === "unsupported") {
        toast.success("Sound alerts enabled (this browser has no notification API)");
      } else {
        toast.success("Sound alerts enabled");
      }
      return;
    }

    setSoundAlertsEnabled(false);
    setSoundAlertsEnabledState(false);
    toast.success("Sound alerts disabled");
  };

  const handleSoundModeChange = async (mode: AlertSoundMode) => {
    if (mode === "custom") {
      const exists = await hasCustomAlertSound();
      if (!exists) {
        fileInputRef.current?.click();
        toast.message("Choose an MP3 file for your custom alert sound");
        return;
      }
      setAlertSoundMode("custom");
      setSoundModeState("custom");
      try {
        await playAlertSoundPreview();
      } catch {
        // ignore
      }
      return;
    }

    setAlertSoundMode("default");
    setSoundModeState("default");
  };

  const handleCustomFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    try {
      await saveCustomAlertSound(file);
      setCustomFileName(file.name);
      setSoundModeState("custom");
      await playAlertSoundPreview();
      toast.success(`Custom sound saved: ${file.name}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save MP3");
    }
  };

  const handleClearCustomSound = async () => {
    await clearCustomAlertSound();
    setCustomFileName(null);
    setSoundModeState("default");
    toast.success("Using default alert sound");
  };

  const handleTestSound = async () => {
    const permission = await requestSoundNotificationPermission();
    setNotifPermission(permission);
    try {
      await playAlertSoundPreview();
      toast.success("Playing test sound");
    } catch {
      toast.error("Could not play sound — check browser permissions");
    }
  };

  const getMinutesUntilTomorrow8am = () => {
    const now = new Date();
    const tomorrow8am = new Date(now);
    tomorrow8am.setDate(tomorrow8am.getDate() + 1);
    tomorrow8am.setHours(8, 0, 0, 0);
    const diffMs = tomorrow8am.getTime() - now.getTime();
    return Math.max(1, Math.round(diffMs / 60000));
  };

  const formatPauseResumeTime = (isoString: string | null) => {
    if (!isoString) return null;
    try {
      const target = new Date(isoString);
      const now = new Date();
      const diffMs = target.getTime() - now.getTime();
      if (diffMs <= 0) return "resuming shortly";
      const totalMinutes = Math.round(diffMs / 60000);
      const hours = Math.floor(totalMinutes / 60);
      const mins = totalMinutes % 60;
      const timeStr = target.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      if (hours > 0) {
        return `Resumes at ${timeStr} (in ${hours}h ${mins}m)`;
      }
      return `Resumes at ${timeStr} (in ${mins}m)`;
    } catch {
      return null;
    }
  };

  const isInsideScheduleNow = () => {
    if (!scheduleEnabled) return true;
    const now = new Date();
    const currentDay = now.getDay(); // 0=Sun..6=Sat
    if (!daysOfWeek.includes(currentDay)) return false;

    const currentMinute = now.getHours() * 60 + now.getMinutes();
    const [sh, sm] = startTime.split(":").map(Number);
    const [eh, em] = endTime.split(":").map(Number);
    const startMin = (sh ?? 0) * 60 + (sm ?? 0);
    const endMin = (eh ?? 0) * 60 + (em ?? 0);

    if (startMin === endMin) return true;
    if (startMin < endMin) {
      return currentMinute >= startMin && currentMinute < endMin;
    } else {
      // overnight window
      return !(currentMinute < startMin && currentMinute >= endMin);
    }
  };

  const handleTogglePause = async (paused: boolean, durationMinutes?: number | null) => {
    if (isSavingPause) return;
    setIsSavingPause(true);
    try {
      const res = await saveAlertDeliverySettings(session, {
        alertsPaused: paused,
        pauseDurationMinutes: durationMinutes !== undefined ? durationMinutes : (paused ? null : 0),
        alertsPausedUntil: paused ? null : null,
      });
      if (res.success && res.alertDelivery) {
        setAlertsPaused(res.alertDelivery.effectivelyPaused);
        setPauseUntil(res.alertDelivery.alertsPausedUntil);
        const durLabel = durationMinutes
          ? durationMinutes >= 60
            ? `${Math.round(durationMinutes / 60)}h`
            : `${durationMinutes}m`
          : null;
        toast.success(
          res.alertDelivery.effectivelyPaused
            ? durLabel
              ? `All alerts paused for ${durLabel}`
              : "All alerts paused until resumed"
            : "All alerts resumed",
        );
        void refetch();
      } else {
        toast.error(res.error || "Failed to update alert pause state");
      }
    } catch {
      toast.error("Failed to update alert pause state");
    } finally {
      setIsSavingPause(false);
    }
  };

  const handleSaveSchedule = async () => {
    if (isSavingSchedule) return;
    setIsSavingSchedule(true);
    try {
      const tzOffsetMinutes = -new Date().getTimezoneOffset();
      const res = await saveAlertDeliverySettings(session, {
        scheduleEnabled,
        startTime,
        endTime,
        daysOfWeek,
        tzOffsetMinutes,
      });
      if (res.success && res.alertDelivery) {
        setScheduleEnabled(res.alertDelivery.scheduleEnabled);
        setStartTime(res.alertDelivery.startTime);
        setEndTime(res.alertDelivery.endTime);
        setDaysOfWeek(res.alertDelivery.daysOfWeek);
        toast.success("Alert delivery schedule saved");
        void refetch();
      } else {
        toast.error(res.error || "Failed to save delivery schedule");
      }
    } catch {
      toast.error("Failed to save delivery schedule");
    } finally {
      setIsSavingSchedule(false);
    }
  };

  const toggleDayOfWeek = (day: number) => {
    setDaysOfWeek((prev) => {
      if (prev.includes(day)) {
        if (prev.length === 1) {
          toast.error("At least one day must be selected");
          return prev;
        }
        return prev.filter((d) => d !== day).sort((a, b) => a - b);
      }
      return [...prev, day].sort((a, b) => a - b);
    });
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
              {tier === "pro" && bootstrap?.dailyUsage ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Today: {bootstrap.dailyUsage.calls}/unlimited calls
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

      {/* 1. Pause All Alerts Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2">
            <PauseIcon className="h-5 w-5 text-primary" />
            Pause all alerts
          </CardTitle>
          {alertsPaused ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-500">
              <PauseIcon className="h-3.5 w-3.5" />
              Alerts Paused
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-500">
              <BellAlertIcon className="h-3.5 w-3.5" />
              Alerts Active
            </span>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Temporarily pause all alert evaluation and notifications. While paused, active alerts
            remain armed without triggering or sending notifications until resumed.
          </p>

          {alertsPaused ? (
            <div className="space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3.5">
              <div className="flex items-start gap-2.5">
                <ClockIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <div className="text-xs text-amber-500">
                  <p className="font-semibold">Alert evaluation is currently paused</p>
                  <p className="mt-0.5 text-muted-foreground">
                    {formatPauseResumeTime(pauseUntil) ||
                      "Paused indefinitely until you click Resume."}
                  </p>
                </div>
              </div>
              <Button
                type="button"
                className="h-10 w-full bg-emerald-600 font-medium text-white hover:bg-emerald-700"
                onClick={() => void handleTogglePause(false)}
                disabled={isSavingPause}
              >
                <PlayIcon className="mr-2 h-4 w-4" />
                Resume all alerts now
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-lg border px-3 py-3">
                <div>
                  <p className="text-sm font-medium">Pause all alerts</p>
                  <p className="text-xs text-muted-foreground">
                    Turn off immediate triggers across all active alerts
                  </p>
                </div>
                <Switch
                  checked={alertsPaused}
                  onCheckedChange={(checked) => void handleTogglePause(checked)}
                  disabled={isSavingPause}
                />
              </div>

              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">Quick pause options</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 text-xs"
                    disabled={isSavingPause}
                    onClick={() => void handleTogglePause(true, 60)}
                  >
                    Pause 1 hour
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 text-xs"
                    disabled={isSavingPause}
                    onClick={() => void handleTogglePause(true, 240)}
                  >
                    Pause 4 hours
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 text-xs"
                    disabled={isSavingPause}
                    onClick={() => void handleTogglePause(true, 480)}
                  >
                    Pause 8 hours
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 text-xs sm:col-span-2"
                    disabled={isSavingPause}
                    onClick={() => void handleTogglePause(true, getMinutesUntilTomorrow8am())}
                  >
                    Until tomorrow 08:00
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 text-xs"
                    disabled={isSavingPause}
                    onClick={() => void handleTogglePause(true, null)}
                  >
                    Until I resume
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 2. Alert Delivery Schedule Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2">
            <ClockIcon className="h-5 w-5 text-primary" />
            Alert delivery schedule
          </CardTitle>
          {!scheduleEnabled ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/60 px-2.5 py-1 text-xs text-muted-foreground">
              24/7 Delivery
            </span>
          ) : isInsideScheduleNow() ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-500">
              Inside delivery hours
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-500">
              Outside delivery hours
            </span>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Specify when alerts should be delivered. Outside your delivery window, active alerts
            remain armed and market structure / candle history continues tracking in the background
            without disturbing you.
          </p>

          <div className="flex items-center justify-between rounded-lg border px-3 py-3">
            <div>
              <p className="text-sm font-medium">Only deliver alerts during scheduled hours</p>
              <p className="text-xs text-muted-foreground">
                {scheduleEnabled
                  ? "Schedule active — alerts are suppressed outside configured hours"
                  : "Disabled — alerts deliver around the clock (24/7)"}
              </p>
            </div>
            <Switch
              checked={scheduleEnabled}
              onCheckedChange={(checked) => setScheduleEnabled(checked)}
            />
          </div>

          {scheduleEnabled && (
            <div className="space-y-4 rounded-lg border bg-card/40 p-3.5">
              {/* Presets */}
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">Quick schedule presets</p>
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => {
                      setStartTime("08:00");
                      setEndTime("22:00");
                    }}
                  >
                    Daytime (08–22)
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => {
                      setStartTime("10:00");
                      setEndTime("23:00");
                    }}
                  >
                    London/NY (10–23)
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => {
                      setStartTime("00:00");
                      setEndTime("23:59");
                    }}
                  >
                    24 Hours (All day)
                  </Button>
                </div>
              </div>

              {/* Time Pickers */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Start time
                  </label>
                  <Input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="h-10"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    End time
                  </label>
                  <Input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="h-10"
                  />
                </div>
              </div>

              {/* Days of Week */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-xs font-medium text-muted-foreground">
                    Active days of the week
                  </label>
                  <div className="flex gap-2 text-xs">
                    <button
                      type="button"
                      className="text-primary hover:underline"
                      onClick={() => setDaysOfWeek([1, 2, 3, 4, 5])}
                    >
                      Mon–Fri
                    </button>
                    <span className="text-muted-foreground">·</span>
                    <button
                      type="button"
                      className="text-primary hover:underline"
                      onClick={() => setDaysOfWeek([0, 1, 2, 3, 4, 5, 6])}
                    >
                      Every day
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
                  {[
                    { label: "Mon", day: 1 },
                    { label: "Tue", day: 2 },
                    { label: "Wed", day: 3 },
                    { label: "Thu", day: 4 },
                    { label: "Fri", day: 5 },
                    { label: "Sat", day: 6 },
                    { label: "Sun", day: 0 },
                  ].map(({ label, day }) => {
                    const active = daysOfWeek.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleDayOfWeek(day)}
                        className={cn(
                          "rounded-md border py-2 text-xs font-medium transition",
                          active
                            ? "border-primary/50 bg-primary/15 text-primary"
                            : "border-border bg-card/60 text-muted-foreground hover:border-primary/30",
                        )}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Status footer */}
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-muted-foreground">
                  Timezone: Local device time (UTC
                  {-new Date().getTimezoneOffset() >= 0
                    ? `+${Math.floor(-new Date().getTimezoneOffset() / 60)}`
                    : `${Math.floor(-new Date().getTimezoneOffset() / 60)}`}
                  )
                </span>
                <span className="text-xs font-medium">
                  {isInsideScheduleNow() ? (
                    <span className="text-emerald-500">● Live delivery armed</span>
                  ) : (
                    <span className="text-amber-500">○ Outside delivery window</span>
                  )}
                </span>
              </div>
            </div>
          )}

          <Button
            type="button"
            className="h-11 w-full"
            onClick={() => void handleSaveSchedule()}
            disabled={isSavingSchedule}
          >
            Save delivery schedule
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sound Alerts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Play a looping sound in the browser for 30 seconds when an alert triggers. Allow
            notification permission so desktop banners (with system sound) appear while this tab
            is open but in the background — closed tabs need push later.
          </p>

          <div className="flex items-center justify-between rounded-lg border px-3 py-3">
            <div>
              <p className="text-sm font-medium">Enable sound alerts</p>
              {notifPermission === "denied" ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Notifications blocked — allow them in browser site settings for background alerts.
                </p>
              ) : notifPermission === "granted" ? (
                <p className="mt-1 text-xs text-muted-foreground">Notifications allowed on this device.</p>
              ) : null}
            </div>
            <Switch checked={soundAlertsEnabled} onCheckedChange={(v) => void handleSoundToggle(v)} />
          </div>

          <div className="space-y-2 rounded-lg border px-3 py-3">
            <p className="text-sm font-medium">Alert sound</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void handleSoundModeChange("default")}
                className={cn(
                  "rounded-lg border px-3 py-2 text-sm transition",
                  soundMode === "default"
                    ? "border-primary/40 bg-primary/10 text-foreground"
                    : "border-border bg-card/60 text-muted-foreground hover:border-primary/30",
                )}
              >
                Default sound
              </button>
              <button
                type="button"
                onClick={() => void handleSoundModeChange("custom")}
                className={cn(
                  "rounded-lg border px-3 py-2 text-sm transition",
                  soundMode === "custom"
                    ? "border-primary/40 bg-primary/10 text-foreground"
                    : "border-border bg-card/60 text-muted-foreground hover:border-primary/30",
                )}
              >
                Custom MP3
              </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".mp3,audio/mpeg"
              className="hidden"
              onChange={(event) => void handleCustomFileChange(event)}
            />

            {soundMode === "custom" || customFileName ? (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {customFileName ? "Replace MP3" : "Choose MP3"}
                </Button>
                {customFileName ? (
                  <>
                    <span className="truncate text-xs text-muted-foreground">{customFileName}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-9"
                      onClick={() => void handleClearCustomSound()}
                    >
                      Clear
                    </Button>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>

          <Button type="button" variant="outline" className="h-11 w-full" onClick={() => void handleTestSound()}>
            Test sound
          </Button>
        </CardContent>
      </Card>

      <Card data-tour="settings-default-phone" className="scroll-mt-24">
        <CardHeader>
          <CardTitle>Default alert method</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            New alerts use this method. In-app sound is always included. Call and SMS use the number
            below, so you do not pick a channel again when creating an alert.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {(["sound", "sms", "call", "email"] as const).map((channel) => (
              <button
                key={channel}
                type="button"
                onClick={() => setDefaultChannel(channel)}
                className={cn(
                  "rounded-lg border px-3 py-2 text-sm transition",
                  defaultChannel === channel
                    ? "border-primary/40 bg-primary/10 text-foreground"
                    : "border-border bg-card/60 text-muted-foreground hover:border-primary/30",
                )}
              >
                {defaultNotifyLabel(channel)}
              </button>
            ))}
          </div>
          <Input
            value={phoneNumber}
            onChange={(event) => setPhoneNumber(event.target.value)}
            placeholder="e.g. +254700000000"
            className="h-12"
          />
          <Button className="h-11 w-full" onClick={() => void savePhoneNumber()} disabled={isSavingPhone}>
            Save
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
