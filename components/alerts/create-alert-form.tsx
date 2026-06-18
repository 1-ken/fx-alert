"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { PhoneIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { useObserverAlerts } from "@/hooks/alerts/use-alerts";
import { useObserverSnapshot } from "@/hooks/snapshot/use-snapshot";
import { useDrawOnLiquidity } from "@/hooks/historical/use-draw-on-liquidity";
import { biasLabel, drawLabel } from "@/lib/draw-on-liquidity";
import { shouldApplyInitialNotifyVia } from "@/lib/alert-form-utils";
import type { AlertCondition, AlertType, CandleDirection } from "@/types/alerts";
import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ALERT_DEFAULT_PHONE_STORAGE_KEY,
  CALL_CUSTOM_MESSAGE_MAX_CHARS,
  CUSTOM_MESSAGE_MAX_CHARS,
} from "@/lib/alert-preferences";
import { saveUserPhone } from "@/lib/api/bootstrap";
import { useBootstrap } from "@/components/bootstrap-provider";
import { AlertCreationFeedbackDialog } from "@/components/feedback/alert-creation-feedback-dialog";
import {
  incrementAlertCreateCount,
  shouldPromptForFeedback,
} from "@/lib/alert-feedback-prompt";
import {
  canCreateMoreAlerts,
  getChannelLimitState,
} from "@/lib/subscription-limits";

const ALERT_RECENT_PAIRS_STORAGE_KEY = "fx-alert:recent-pairs";

const channelOptions = [
  { value: "sms" as const, label: "SMS" },
  { value: "call" as const, label: "Call" },
  { value: "sound" as const, label: "Sound (in-app)" },
  { value: "email" as const, label: "Email" },
];

const conditionOptions: Array<{
  value: AlertCondition;
  label: string;
  description: string;
}> = [
  {
    value: "above",
    label: "Price goes above",
    description: "Trigger when market price rises above your target.",
  },
  {
    value: "below",
    label: "Price goes below",
    description: "Trigger when market price falls below your target.",
  },
  {
    value: "equal",
    label: "Price equals to",
    description: "Trigger when market price reaches your exact target.",
  },
];

const candleDirectionOptions: Array<{
  value: CandleDirection;
  label: string;
  description: string;
}> = [
  {
    value: "above",
    label: "Candle closes above",
    description: "Trigger when selected interval candle closes above threshold.",
  },
  {
    value: "below",
    label: "Candle closes below",
    description: "Trigger when selected interval candle closes below threshold.",
  },
];

const candleIntervalOptions = ["1m", "5m", "15m", "30m", "1h", "4h", "1d"] as const;

const fallbackPairs = [
  "EUR/USD",
  "USD/JPY",
  "GBP/USD",
  "AUD/USD",
  "NZD/USD",
  "EUR/JPY",
  "GBP/JPY",
  "EUR/GBP",
  "USD/CHF",
  "USD/CAD",
];

function formatPairLabel(pair: string): string {
  const compact = pair.replace(/[^a-z0-9]/gi, "").toUpperCase();
  if (compact.length === 6 && /^[A-Z]{6}$/.test(compact)) {
    return `${compact.slice(0, 3)}/${compact.slice(3)} (${compact.slice(0, 3)} / ${compact.slice(3)} Dollar)`;
  }

  return compact;
}

function normalizePair(pair: string): string {
  const compact = pair.replace(/[^a-z0-9]/gi, "").toUpperCase();
  if (compact.length === 6 && /^[A-Z]{6}$/.test(compact)) {
    return `${compact.slice(0, 3)}/${compact.slice(3)}`;
  }

  return compact;
}

function parseNumericString(value: string): number {
  return Number(value.replace(/,/g, "").trim());
}

const drawTriggerOptions: Array<{
  value: "sweep" | "displacement" | "reversal" | "draw_met";
  label: string;
  description: string;
}> = [
  {
    value: "sweep",
    label: "Liquidity sweep",
    description: "Price trades through the previous-day high/low (live).",
  },
  {
    value: "draw_met",
    label: "Draw reached",
    description: "Price reaches the model's projected draw on liquidity (live).",
  },
  {
    value: "displacement",
    label: "Displacement",
    description: "Daily candle closes beyond the previous-day level.",
  },
  {
    value: "reversal",
    label: "Reversal",
    description: "Daily candle sweeps a level then closes back inside.",
  },
];

const drawLevelOptions: Array<{
  value: "high" | "low" | "both";
  label: string;
  description: string;
}> = [
  { value: "both", label: "PDH & PDL", description: "Either previous-day extreme." },
  { value: "high", label: "PDH only", description: "Previous-day high." },
  { value: "low", label: "PDL only", description: "Previous-day low." },
];

const alertFormSchema = z
  .object({
    alert_type: z.enum(["price", "candle_close", "prev_day_level"]),
    pair: z.string().optional(),
    pairs: z.array(z.string()).optional(),
    level_ref: z.enum(["high", "low", "both"]).optional(),
    dol_trigger: z.enum(["sweep", "displacement", "reversal", "draw_met"]).optional(),
    target_price: z.string().optional(),
    condition: z.enum(["above", "below", "equal"]).optional(),
    interval: z.string().optional(),
    direction: z.enum(["above", "below"]).optional(),
    threshold: z.string().optional(),
    notifyVia: z.array(z.enum(["sms", "call", "sound", "email"])),
    email: z.string().trim().optional(),
    phone: z.string().trim().optional(),
    custom_message: z.string().trim().optional(),
  })
  .superRefine((value, ctx) => {
    const selectedChannels = value.notifyVia;
    const selectedSet = new Set(selectedChannels);

    if (selectedSet.size === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["notifyVia"],
        message: "Select notification channels",
      });
    }

    if (value.alert_type !== "prev_day_level" && !value.pair) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["pair"],
        message: "Please select a pair",
      });
    }

    if (value.alert_type === "prev_day_level") {
      if (!value.pairs || value.pairs.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["pairs"],
          message: "Select at least one pair",
        });
      }
      if (!value.dol_trigger) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["dol_trigger"],
          message: "Select a trigger",
        });
      }
      if (!value.level_ref) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["level_ref"],
          message: "Select which level to watch",
        });
      }
    }

    if (value.alert_type === "price") {
      if (!value.target_price || !Number.isFinite(parseNumericString(value.target_price))) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["target_price"],
          message: "Enter a valid target price",
        });
      }

      if (!value.condition) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["condition"],
          message: "Select a condition",
        });
      }
    }

    if (value.alert_type === "candle_close") {
      if (!value.interval) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["interval"],
          message: "Select a candle interval",
        });
      }

      if (!value.direction) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["direction"],
          message: "Select candle close direction",
        });
      }

      if (!value.threshold || !Number.isFinite(parseNumericString(value.threshold))) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["threshold"],
          message: "Enter a valid threshold",
        });
      }
    }

    if (selectedSet.has("sms") && !value.phone) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["phone"],
        message: "Phone number is required for SMS notifications",
      });
    }

    if (selectedSet.has("call") && !value.phone) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["phone"],
        message: "Phone number is required for call notifications",
      });
    }

    if (selectedSet.has("email") && !value.email) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["email"],
        message: "Email is required for email notifications",
      });
    }

    const customMessage = value.custom_message?.trim() ?? "";
    if (customMessage) {
      const maxLen = selectedSet.has("call")
        ? CALL_CUSTOM_MESSAGE_MAX_CHARS
        : CUSTOM_MESSAGE_MAX_CHARS;
      if (customMessage.length > maxLen) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["custom_message"],
          message: selectedSet.has("call")
            ? `Custom message must be ${CALL_CUSTOM_MESSAGE_MAX_CHARS} characters or less (~1 minute when spoken)`
            : `Custom message must be ${CUSTOM_MESSAGE_MAX_CHARS} characters or less`,
        });
      }
    }

    if (value.email && !z.email().safeParse(value.email).success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["email"],
        message: "Enter a valid email address",
      });
    }
  });

type AlertFormValues = z.infer<typeof alertFormSchema>;

type NotifyChannel = "sms" | "call" | "sound" | "email";

type CreateAlertFormProps = {
  initialPair?: string;
  initialAlertType?: string;
  initialTargetPrice?: string;
  initialThreshold?: string;
  initialInterval?: string;
  initialNotifyVia?: NotifyChannel[];
};

function normalizeRecentPairs(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string").map(normalizePair);
}

function readRecentPairs(): string[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    return normalizeRecentPairs(JSON.parse(window.localStorage.getItem(ALERT_RECENT_PAIRS_STORAGE_KEY) ?? "[]"));
  } catch {
    return [];
  }
}

function writeRecentPairs(pair: string) {
  if (typeof window === "undefined") {
    return;
  }

  const normalizedPair = normalizePair(pair);
  const nextPairs = [normalizedPair, ...readRecentPairs().filter((item) => item !== normalizedPair)].slice(0, 3);
  window.localStorage.setItem(ALERT_RECENT_PAIRS_STORAGE_KEY, JSON.stringify(nextPairs));
}

export function CreateAlertForm({
  initialPair,
  initialAlertType,
  initialTargetPrice,
  initialThreshold,
  initialInterval,
  initialNotifyVia,
}: CreateAlertFormProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const { bootstrap } = useBootstrap();
  const { createAlert, alerts } = useObserverAlerts();
  const { data: snapshot } = useObserverSnapshot(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedbackDialogOpen, setFeedbackDialogOpen] = useState(false);
  const [recentPairs, setRecentPairs] = useState<string[]>([]);
  const initialNotifyViaAppliedRef = useRef(false);

  const normalizedInitialPair = useMemo(() => {
    const pair = initialPair?.trim();
    return pair ? normalizePair(pair) : "";
  }, [initialPair]);

  const normalizedInitialTargetPrice = useMemo(() => {
    const price = initialTargetPrice?.trim();
    if (!price) {
      return "";
    }

    return Number.isFinite(Number(price.replace(/,/g, ""))) ? price : "";
  }, [initialTargetPrice]);

  const pairs = useMemo(() => {
    const streamedPairs = (snapshot?.pairs ?? []).map((pair) => normalizePair(pair.pair));
    return Array.from(new Set([...streamedPairs, ...fallbackPairs])).sort();
  }, [snapshot?.pairs]);

  const pairPriceMap = useMemo(() => {
    return new Map(
      (snapshot?.pairs ?? []).map((pair) => [normalizePair(pair.pair), pair.price])
    );
  }, [snapshot?.pairs]);

  const form = useForm<AlertFormValues>({
    resolver: zodResolver(alertFormSchema),
    defaultValues: {
      alert_type:
        initialAlertType === "candle_close"
          ? "candle_close"
          : initialAlertType === "prev_day_level"
            ? "prev_day_level"
            : "price",
      pair: normalizedInitialPair,
      pairs: normalizedInitialPair ? [normalizedInitialPair] : [],
      level_ref: "both",
      dol_trigger: "sweep",
      target_price: initialAlertType === "price" ? normalizedInitialTargetPrice : "",
      condition: "above",
      interval: initialInterval && candleIntervalOptions.includes(initialInterval as (typeof candleIntervalOptions)[number])
        ? initialInterval
        : "1m",
      direction: "above",
      threshold: initialAlertType === "candle_close" ? (initialThreshold || normalizedInitialTargetPrice) : "",
      notifyVia: initialNotifyVia ?? ["sms"],
      email: "",
      phone: "",
      custom_message: "",
    },
  });

  useEffect(() => {
    const currentPhone = form.getValues("phone")?.trim();
    if (currentPhone) {
      return;
    }

    const serverPhone = bootstrap?.phone?.trim();
    if (serverPhone) {
      form.setValue("phone", serverPhone, { shouldDirty: false, shouldValidate: true });
      window.localStorage.setItem(ALERT_DEFAULT_PHONE_STORAGE_KEY, serverPhone);
      return;
    }

    const savedPhone = window.localStorage.getItem(ALERT_DEFAULT_PHONE_STORAGE_KEY)?.trim();
    if (savedPhone) {
      form.setValue("phone", savedPhone, { shouldDirty: false, shouldValidate: true });
    }
  }, [bootstrap?.phone, form]);

  useEffect(() => {
    setRecentPairs(readRecentPairs());
  }, []);

  useEffect(() => {
    if (normalizedInitialPair) {
      form.setValue("pair", normalizedInitialPair, { shouldDirty: false, shouldValidate: true });
      setPairSearch(normalizedInitialPair);
    }
  }, [form, normalizedInitialPair]);

  useEffect(() => {
    if (initialAlertType === "candle_close") {
      form.setValue("alert_type", "candle_close", { shouldDirty: false, shouldValidate: true });
    }

    if (initialAlertType === "price") {
      form.setValue("alert_type", "price", { shouldDirty: false, shouldValidate: true });
    }

    if (initialAlertType === "prev_day_level") {
      form.setValue("alert_type", "prev_day_level", {
        shouldDirty: false,
        shouldValidate: true,
      });
    }
  }, [form, initialAlertType]);

  useEffect(() => {
    if (initialAlertType === "price" && normalizedInitialTargetPrice) {
      form.setValue("target_price", normalizedInitialTargetPrice, {
        shouldDirty: false,
        shouldValidate: true,
      });
    }
  }, [form, initialAlertType, normalizedInitialTargetPrice]);

  useEffect(() => {
    if (initialAlertType === "candle_close") {
      const nextThreshold = initialThreshold || normalizedInitialTargetPrice;
      if (nextThreshold) {
        form.setValue("threshold", nextThreshold, {
          shouldDirty: false,
          shouldValidate: true,
        });
      }
    }
  }, [form, initialAlertType, initialThreshold, normalizedInitialTargetPrice]);

  useEffect(() => {
    if (initialInterval) {
      form.setValue("interval", initialInterval, { shouldDirty: false, shouldValidate: true });
    }
  }, [form, initialInterval]);

  useEffect(() => {
    if (
      !shouldApplyInitialNotifyVia(
        initialNotifyViaAppliedRef.current,
        initialNotifyVia,
      )
    ) {
      return;
    }
    initialNotifyViaAppliedRef.current = true;
    form.setValue("notifyVia", initialNotifyVia, {
      shouldDirty: false,
      shouldValidate: true,
    });
  }, [form, initialNotifyVia]);

  const selectedPair = form.watch("pair");
  const selectedAlertType = form.watch("alert_type");
  const selectedDolPairs = form.watch("pairs") ?? [];
  const [pairSearch, setPairSearch] = useState(() => selectedPair || "");
  const [isPairInputFocused, setIsPairInputFocused] = useState(false);
  const [dolPairSearch, setDolPairSearch] = useState("");

  const dolPairSearchText = useMemo(
    () => dolPairSearch.replace(/[^a-z0-9]/gi, "").toUpperCase(),
    [dolPairSearch],
  );
  const dolFilteredPairs = useMemo(() => {
    if (!dolPairSearchText) {
      return pairs.slice(0, 8);
    }
    return pairs
      .filter((pair) =>
        pair.replace(/[^a-z0-9]/gi, "").toUpperCase().includes(dolPairSearchText),
      )
      .slice(0, 8);
  }, [dolPairSearchText, pairs]);

  const firstDolPair = selectedDolPairs[0]
    ? normalizePair(selectedDolPairs[0]).replace("/", "")
    : "";
  const { live: dolLive } = useDrawOnLiquidity(firstDolPair);
  const pairSearchText = useMemo(
    () => pairSearch.replace(/[^a-z0-9]/gi, "").toUpperCase(),
    [pairSearch]
  );

  const filteredPairs = useMemo(() => {
    if (!pairSearchText) {
      return [];
    }

    return pairs
      .filter((pair) => {
        const normalizedPair = pair.replace(/[^a-z0-9]/gi, "").toUpperCase();
        return normalizedPair.includes(pairSearchText);
      })
      .sort((pairA, pairB) => {
        const compactA = pairA.replace(/[^a-z0-9]/gi, "").toUpperCase();
        const compactB = pairB.replace(/[^a-z0-9]/gi, "").toUpperCase();
        const aExact = compactA === pairSearchText ? 1 : 0;
        const bExact = compactB === pairSearchText ? 1 : 0;

        if (aExact !== bExact) {
          return bExact - aExact;
        }

        const aStarts = compactA.startsWith(pairSearchText) ? 1 : 0;
        const bStarts = compactB.startsWith(pairSearchText) ? 1 : 0;

        if (aStarts !== bStarts) {
          return bStarts - aStarts;
        }

        return pairA.localeCompare(pairB);
      })
      .slice(0, 8);
  }, [pairSearchText, pairs]);

  const showPairSuggestions = isPairInputFocused && pairSearchText.length >= 2;

  const notifyVia = form.watch("notifyVia");
  const selectedChannelSet = useMemo(() => new Set(notifyVia), [notifyVia]);
  const activeAlertCount = alerts?.active?.length ?? 0;
  const createLimit = canCreateMoreAlerts(bootstrap, activeAlertCount);
  const showPhoneInput = selectedChannelSet.has("sms") || selectedChannelSet.has("call");
  const showEmailInput = selectedChannelSet.has("email");
  const isCallChannel = selectedChannelSet.has("call");
  const customMessageMaxChars = isCallChannel
    ? CALL_CUSTOM_MESSAGE_MAX_CHARS
    : CUSTOM_MESSAGE_MAX_CHARS;
  const livePrice = selectedPair ? pairPriceMap.get(selectedPair) : undefined;

  const selectedPriceValue = selectedAlertType === "price"
    ? form.watch("target_price")
    : form.watch("threshold");

  const selectedPricePlaceholder = livePrice ? livePrice.toString() : "1.0845";

  const pickRecentPair = (pair: string) => {
    const normalizedPair = normalizePair(pair);
    setPairSearch(normalizedPair);
    form.setValue("pair", normalizedPair, { shouldDirty: true, shouldValidate: true });

    if (selectedAlertType === "price") {
      form.setValue("target_price", livePrice?.toString() ?? selectedPriceValue ?? selectedPricePlaceholder, {
        shouldDirty: true,
        shouldValidate: true,
      });
    } else {
      form.setValue("threshold", livePrice?.toString() ?? selectedPriceValue ?? selectedPricePlaceholder, {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
  };

  useEffect(() => {
    if (!pairSearch && selectedPair) {
      setPairSearch(selectedPair);
    }
  }, [pairSearch, selectedPair]);

  const goToDashboard = () => {
    router.push("/dashboard");
    router.refresh();
  };

  async function onSubmit(values: AlertFormValues) {
    if (!createLimit.allowed) {
      toast.error(createLimit.reason ?? "Cannot create more alerts on your current plan.");
      return;
    }

    setIsSubmitting(true);

    try {
      const alertType = values.alert_type as AlertType;
      const channelsToCreate = values.notifyVia.filter(
        (channel): channel is "sms" | "call" | "sound" | "email" =>
          channel === "sms" ||
          channel === "call" ||
          channel === "sound" ||
          channel === "email"
      );

      const needsPhone = channelsToCreate.some(
        (channel) => channel === "sms" || channel === "call",
      );
      const needsEmail = channelsToCreate.includes("email");
      const basePayload = {
        alert_type: alertType,
        pair: normalizePair(values.pair ?? "").replace("/", ""),
        channels: channelsToCreate,
        email: needsEmail ? values.email : undefined,
        phone: needsPhone ? values.phone : "",
        custom_message: values.custom_message || undefined,
      };

      if (alertType === "prev_day_level") {
        const normalizedPairs = (values.pairs ?? [])
          .map((pair) => normalizePair(pair).replace("/", ""))
          .filter((pair, index, all) => pair && all.indexOf(pair) === index);
        await createAlert({
          ...basePayload,
          pair: normalizedPairs[0] ?? "",
          pairs: normalizedPairs,
          level_ref: values.level_ref,
          dol_trigger: values.dol_trigger,
        });
      } else if (alertType === "price") {
        await createAlert({
          ...basePayload,
          target_price: parseNumericString(values.target_price ?? ""),
          condition: values.condition,
        });
      } else {
        await createAlert({
          ...basePayload,
          interval: values.interval,
          direction: values.direction,
          threshold: parseNumericString(values.threshold ?? ""),
        });
      }

      if (needsPhone && values.phone?.trim()) {
        const phoneResult = await saveUserPhone(session, values.phone, { onlyIfEmpty: true });
        const savedPhone = phoneResult.phone?.trim() || values.phone.trim();
        window.localStorage.setItem(ALERT_DEFAULT_PHONE_STORAGE_KEY, savedPhone);
      }

      const recentPairToStore = values.pair || values.pairs?.[0] || "";
      if (recentPairToStore) {
        writeRecentPairs(recentPairToStore);
        setRecentPairs(readRecentPairs());
      }

      const userId = session?.user?.id ?? bootstrap?.userId ?? "";
      const createCount = incrementAlertCreateCount(userId);
      if (shouldPromptForFeedback(createCount)) {
        setFeedbackDialogOpen(true);
      } else {
        goToDashboard();
      }
    } catch (error) {
      let message = "Failed to create alert";
      if (error instanceof Error) {
        try {
          const parsed = JSON.parse(error.message) as { detail?: string };
          message = parsed.detail ?? error.message;
        } catch {
          message = error.message;
        }
      }
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <AlertCreationFeedbackDialog
        open={feedbackDialogOpen}
        session={session ?? null}
        onComplete={goToDashboard}
      />
      <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <FormField
                control={form.control}
                name="alert_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Alert Type</FormLabel>
                    <FormControl>
                      <Tabs
                        value={field.value}
                        onValueChange={(value) => {
                          field.onChange(value);
                          form.clearErrors([
                            "target_price",
                            "condition",
                            "interval",
                            "direction",
                            "threshold",
                            "pair",
                            "pairs",
                            "level_ref",
                            "dol_trigger",
                          ]);
                        }}
                      >
                        <TabsList className="grid w-full grid-cols-3 h-12">
                          <TabsTrigger value="price">Price</TabsTrigger>
                          <TabsTrigger value="candle_close">Candle Close</TabsTrigger>
                          <TabsTrigger value="prev_day_level">Draw on Liquidity</TabsTrigger>
                        </TabsList>
                      </Tabs>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {selectedAlertType !== "prev_day_level" ? (
              <FormField
                control={form.control}
                name="pair"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Search Pair</FormLabel>
                    <FormControl>
                      <div className="space-y-2">
                        <Input
                          value={pairSearch}
                          onFocus={() => setIsPairInputFocused(true)}
                          onBlur={() => setIsPairInputFocused(false)}
                          onChange={(event) => {
                            const rawInput = event.target.value;
                            const normalizedInput = normalizePair(rawInput);
                            const exactPair = pairs.find((pair) => pair === normalizedInput);

                            setPairSearch(rawInput.toUpperCase());
                            field.onChange(exactPair ?? "");
                          }}
                          placeholder="Type pair, e.g. EURUSD or EUR/USD"
                          className="h-12 border-border bg-background"
                        />

                        {showPairSuggestions ? (
                          <div className="max-h-44 overflow-y-auto rounded-md border border-border bg-card p-1 shadow-sm">
                            {filteredPairs.length > 0 ? (
                              filteredPairs.map((pair) => (
                                <button
                                  key={pair}
                                  type="button"
                                  onMouseDown={(event) => event.preventDefault()}
                                  onClick={() => {
                                    setPairSearch(pair);
                                    field.onChange(pair);
                                    form.clearErrors("pair");
                                    setIsPairInputFocused(false);
                                  }}
                                  className={cn(
                                    "flex w-full items-center rounded-md px-3 py-2 text-left text-sm transition",
                                    field.value === pair
                                      ? "bg-primary/10 text-foreground"
                                      : "text-foreground hover:bg-accent hover:text-accent-foreground"
                                  )}
                                >
                                  {formatPairLabel(pair)}
                                </button>
                              ))
                            ) : (
                              <p className="px-3 py-2 text-sm text-muted-foreground">No pairs found for this search.</p>
                            )}
                          </div>
                        ) : null}

                        {recentPairs.length > 0 ? (
                          <div className="space-y-2 pt-1">
                            <p className="text-xs text-muted-foreground">Recent pairs</p>
                            <div className="flex flex-wrap gap-2">
                              {recentPairs.map((pair) => {
                                const recentPrice = pairPriceMap.get(pair);
                                const badgeLabel = recentPrice ? `${formatPairLabel(pair)} · ${recentPrice.toString()}` : formatPairLabel(pair);

                                return (
                                  <button
                                    key={pair}
                                    type="button"
                                    onMouseDown={(event) => event.preventDefault()}
                                    onClick={() => pickRecentPair(pair)}
                                    className={cn(
                                      "rounded-full border px-3 py-1 text-xs font-medium transition",
                                      pair === selectedPair
                                        ? "border-primary/40 bg-primary/10 text-foreground"
                                        : "border-border bg-card text-foreground hover:border-primary/30 hover:bg-accent/40"
                                    )}
                                  >
                                    {badgeLabel}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              ) : null}

              {selectedAlertType === "prev_day_level" ? (
                <>
                  <FormField
                    control={form.control}
                    name="pairs"
                    render={({ field }) => {
                      const selected = field.value ?? [];
                      const togglePair = (pair: string) => {
                        const next = selected.includes(pair)
                          ? selected.filter((item) => item !== pair)
                          : [...selected, pair];
                        field.onChange(next);
                        form.clearErrors("pairs");
                      };
                      return (
                        <FormItem>
                          <FormLabel>Pairs to watch</FormLabel>
                          <FormControl>
                            <div className="space-y-2">
                              <Input
                                value={dolPairSearch}
                                onChange={(event) =>
                                  setDolPairSearch(event.target.value.toUpperCase())
                                }
                                placeholder="Search pairs, e.g. EURUSD"
                                className="h-12 border-border bg-background"
                              />
                              {selected.length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                  {selected.map((pair) => (
                                    <button
                                      key={pair}
                                      type="button"
                                      onClick={() => togglePair(pair)}
                                      className="rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-medium text-foreground"
                                    >
                                      {formatPairLabel(pair)} ✕
                                    </button>
                                  ))}
                                </div>
                              ) : null}
                              <div className="max-h-44 overflow-y-auto rounded-md border border-border bg-card p-1 shadow-sm">
                                {dolFilteredPairs.length > 0 ? (
                                  dolFilteredPairs.map((pair) => {
                                    const isSelected = selected.includes(pair);
                                    return (
                                      <button
                                        key={pair}
                                        type="button"
                                        onClick={() => togglePair(pair)}
                                        className={cn(
                                          "flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition",
                                          isSelected
                                            ? "bg-primary/10 text-foreground"
                                            : "text-foreground hover:bg-accent hover:text-accent-foreground",
                                        )}
                                      >
                                        <span>{formatPairLabel(pair)}</span>
                                        {isSelected ? <span>✓</span> : null}
                                      </button>
                                    );
                                  })
                                ) : (
                                  <p className="px-3 py-2 text-sm text-muted-foreground">
                                    No pairs found.
                                  </p>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                Selected {selected.length} pair{selected.length === 1 ? "" : "s"}.
                                One alert is created per pair.
                              </p>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />

                  {firstDolPair && dolLive ? (
                    <div className="rounded-lg border border-border bg-card/60 px-3 py-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{firstDolPair}</span> bias:{" "}
                      {biasLabel(dolLive.bias)} · PDH {dolLive.pdh.toFixed(5)} · PDL{" "}
                      {dolLive.pdl.toFixed(5)}
                      {dolLive.draw !== "none"
                        ? ` · draw ${drawLabel(dolLive.draw)}`
                        : ""}
                    </div>
                  ) : null}

                  <FormField
                    control={form.control}
                    name="dol_trigger"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Trigger</FormLabel>
                        <div className="space-y-3">
                          {drawTriggerOptions.map((option) => {
                            const active = field.value === option.value;
                            return (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() => field.onChange(option.value)}
                                className={cn(
                                  "flex w-full items-center gap-3 rounded-xl border px-4 py-4 text-left transition",
                                  active
                                    ? "border-primary/40 bg-primary/10 text-foreground"
                                    : "border-border bg-card/60 text-foreground hover:border-primary/30 hover:bg-accent/40",
                                )}
                              >
                                <span
                                  className={cn(
                                    "flex h-5 w-5 items-center justify-center rounded-full border",
                                    active ? "border-primary" : "border-muted-foreground/40",
                                  )}
                                >
                                  <span
                                    className={cn(
                                      "h-2.5 w-2.5 rounded-full",
                                      active ? "bg-primary" : "bg-transparent",
                                    )}
                                  />
                                </span>
                                <span className="space-y-1">
                                  <span className="block text-sm font-medium">{option.label}</span>
                                  <span className="block text-xs text-muted-foreground">
                                    {option.description}
                                  </span>
                                </span>
                              </button>
                            );
                          })}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="level_ref"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Level</FormLabel>
                        <div className="grid grid-cols-3 gap-2">
                          {drawLevelOptions.map((option) => {
                            const active = field.value === option.value;
                            return (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() => field.onChange(option.value)}
                                title={option.description}
                                className={cn(
                                  "rounded-lg border px-3 py-2 text-sm transition",
                                  active
                                    ? "border-primary/40 bg-primary/10 text-foreground"
                                    : "border-border bg-card text-foreground hover:border-primary/30 hover:bg-accent/40",
                                )}
                              >
                                {option.label}
                              </button>
                            );
                          })}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              ) : null}

              {selectedAlertType === "price" ? (
                <>
                  <FormField
                    control={form.control}
                    name="target_price"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Target Price</FormLabel>
                        <FormControl>
                          <InputGroup className="h-12 border-border bg-background">
                            <InputGroupInput
                              inputMode="decimal"
                              placeholder={selectedPricePlaceholder}
                              className="h-12 text-base"
                              {...field}
                            />
                            <InputGroupAddon align="inline-end" className="pr-4">
                              <InputGroupText>USD</InputGroupText>
                            </InputGroupAddon>
                          </InputGroup>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="condition"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Condition</FormLabel>
                        <div className="space-y-3">
                          {conditionOptions.map((option) => {
                            const active = field.value === option.value;

                            return (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() => field.onChange(option.value)}
                                className={cn(
                                  "flex w-full items-center gap-3 rounded-xl border px-4 py-4 text-left transition",
                                  active
                                    ? "border-primary/40 bg-primary/10 text-foreground"
                                    : "border-border bg-card/60 text-foreground hover:border-primary/30 hover:bg-accent/40"
                                )}
                              >
                                <span
                                  className={cn(
                                    "flex h-5 w-5 items-center justify-center rounded-full border",
                                    active ? "border-primary" : "border-muted-foreground/40"
                                  )}
                                >
                                  <span
                                    className={cn(
                                      "h-2.5 w-2.5 rounded-full",
                                      active ? "bg-primary" : "bg-transparent"
                                    )}
                                  />
                                </span>
                                <span className="space-y-1">
                                  <span className="block text-sm font-medium">{option.label}</span>
                                  <span className="block text-xs text-muted-foreground">{option.description}</span>
                                </span>
                              </button>
                            );
                          })}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              ) : selectedAlertType === "candle_close" ? (
                <>
                  <FormField
                    control={form.control}
                    name="interval"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Candle Interval</FormLabel>
                        <div className="grid grid-cols-4 gap-2">
                          {candleIntervalOptions.map((interval) => {
                            const active = field.value === interval;

                            return (
                              <button
                                key={interval}
                                type="button"
                                onClick={() => field.onChange(interval)}
                                className={cn(
                                  "rounded-lg border px-3 py-2 text-sm transition",
                                  active
                                    ? "border-primary/40 bg-primary/10 text-foreground"
                                    : "border-border bg-card text-foreground hover:border-primary/30 hover:bg-accent/40"
                                )}
                              >
                                {interval}
                              </button>
                            );
                          })}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="threshold"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Threshold</FormLabel>
                        <FormControl>
                          <InputGroup className="h-12 border-border bg-background">
                            <InputGroupInput
                              inputMode="decimal"
                              placeholder={selectedPricePlaceholder}
                              className="h-12 text-base"
                              {...field}
                            />
                            <InputGroupAddon align="inline-end" className="pr-4">
                              <InputGroupText>USD</InputGroupText>
                            </InputGroupAddon>
                          </InputGroup>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="direction"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Candle Close Direction</FormLabel>
                        <div className="space-y-3">
                          {candleDirectionOptions.map((option) => {
                            const active = field.value === option.value;

                            return (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() => field.onChange(option.value)}
                                className={cn(
                                  "flex w-full items-center gap-3 rounded-xl border px-4 py-4 text-left transition",
                                  active
                                    ? "border-primary/40 bg-primary/10 text-foreground"
                                    : "border-border bg-card/60 text-foreground hover:border-primary/30 hover:bg-accent/40"
                                )}
                              >
                                <span
                                  className={cn(
                                    "flex h-5 w-5 items-center justify-center rounded-full border",
                                    active ? "border-primary" : "border-muted-foreground/40"
                                  )}
                                >
                                  <span
                                    className={cn(
                                      "h-2.5 w-2.5 rounded-full",
                                      active ? "bg-primary" : "bg-transparent"
                                    )}
                                  />
                                </span>
                                <span className="space-y-1">
                                  <span className="block text-sm font-medium">{option.label}</span>
                                  <span className="block text-xs text-muted-foreground">{option.description}</span>
                                </span>
                              </button>
                            );
                          })}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              ) : null}

              {!createLimit.allowed ? (
                <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  {createLimit.reason}
                </p>
              ) : null}

              <FormField
                control={form.control}
                name="notifyVia"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notify me via</FormLabel>
                    <div className="grid grid-cols-2 gap-3">
                      {channelOptions.map((channel) => {
                        const isSelected = selectedChannelSet.has(channel.value);
                        const limit = getChannelLimitState(channel.value, bootstrap);
                        const isDisabled = limit.disabled;

                        return (
                          <button
                            key={channel.value}
                            type="button"
                            disabled={isDisabled}
                            title={limit.reason}
                            onClick={() => {
                              if (isDisabled) {
                                if (limit.reason) toast.error(limit.reason);
                                return;
                              }
                              const next = isSelected
                                ? field.value.filter((item) => item !== channel.value)
                                : [...field.value, channel.value];
                              field.onChange(next);
                              form.clearErrors("notifyVia");
                            }}
                            className={cn(
                              "rounded-lg border px-3 py-2 text-sm transition active:scale-[0.97]",
                              isDisabled && "cursor-not-allowed opacity-50",
                              isSelected
                                ? "border-primary/40 bg-primary/10 text-foreground"
                                : "border-border bg-card text-foreground hover:border-primary/30 hover:bg-accent/40"
                            )}
                          >
                            {channel.label}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Select one or more channels. SMS and call require a phone number; email requires
                      an address. Sound plays in the browser when enabled in Settings.
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {showPhoneInput ? (
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Alert phone number (international)
                      </FormLabel>
                      <FormControl>
                        <InputGroup className="h-12 border-border bg-background">
                          <InputGroupAddon align="inline-start" className="pl-4 text-muted-foreground">
                            <PhoneIcon className="h-4 w-4" />
                          </InputGroupAddon>
                          <InputGroupInput
                            placeholder="+254700000000"
                            className="h-12 text-base"
                            {...field}
                          />
                        </InputGroup>
                      </FormControl>
                      <p className="text-xs text-muted-foreground">
                        Required for SMS and call alerts. Uses your default from Settings when saved.
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : null}

              {showEmailInput ? (
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Alert email address</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="you@example.com"
                          className="h-12 border-border bg-background"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : null}

              <FormField
                control={form.control}
                name="custom_message"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Custom Message <span className="font-normal text-muted-foreground">(optional)</span></FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="e.g. EUR/USD has hit your target, time to act!"
                        className="min-h-22 resize-none border-border bg-background"
                        maxLength={customMessageMaxChars}
                        {...field}
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      {isCallChannel
                        ? `For call alerts, keep text under ${CALL_CUSTOM_MESSAGE_MAX_CHARS} characters (~1 minute when spoken).`
                        : "This message will be included in your alert notification."}{" "}
                      <span className="tabular-nums">
                        {(field.value?.length ?? 0)}/{customMessageMaxChars}
                      </span>
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-3 border-t border-border pt-5">
                <Button
                  type="submit"
                  className="h-12 w-full"
                  disabled={isSubmitting || !createLimit.allowed}
                >
                  {isSubmitting ? (
                    <>
                      <Spinner className="mr-2 h-4 w-4" />
                      Creating Alert...
                    </>
                  ) : (
                    "Create Alert"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 w-full"
                  disabled={isSubmitting}
                  onClick={() => router.push("/dashboard")}
                >
                  Cancel
                </Button>
              </div>
      </form>
    </Form>
    </>
  );
}
