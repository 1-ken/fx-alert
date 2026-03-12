"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  BellAlertIcon,
  PhoneIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { useObserverAlerts } from "@/hooks/alerts/use-alerts";
import { useObserverSnapshot } from "@/hooks/snapshot/use-snapshot";
import type { AlertChannel, AlertCondition } from "@/types/alerts";
import { cn } from "@/lib/utils";

const channelOptions = [
  { value: "email" as const, label: "Email" },
  { value: "sms" as const, label: "SMS" },
  { value: "call" as const, label: "Voice Call" },
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
  const compact = pair.replace("/", "").toUpperCase();
  if (compact.length === 6) {
    return `${compact.slice(0, 3)}/${compact.slice(3)} (${compact.slice(0, 3)} / ${compact.slice(3)} Dollar)`;
  }

  return pair;
}

function normalizePair(pair: string): string {
  const compact = pair.replace(/[^a-z]/gi, "").toUpperCase();
  if (compact.length === 6) {
    return `${compact.slice(0, 3)}/${compact.slice(3)}`;
  }

  return pair.toUpperCase();
}

function parseNumericString(value: string): number {
  return Number(value.replace(/,/g, "").trim());
}

const alertFormSchema = z
  .object({
    pair: z.string().min(1, "Please select a pair"),
    target_price: z
      .string()
      .min(1, "Target price is required")
      .refine((value) => Number.isFinite(parseNumericString(value)), "Enter a valid price"),
    condition: z.enum(["above", "below", "equal"]),
    channels: z.array(z.enum(["email", "sms", "call"])).min(1, "Select at least one notification channel"),
    email: z.string().trim().optional(),
    phone: z.string().trim().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.channels.includes("email") && !value.email) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["email"],
        message: "Email is required when Email notifications are selected",
      });
    }

    if ((value.channels.includes("sms") || value.channels.includes("call")) && !value.phone) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["phone"],
        message: "Phone number is required for SMS or Voice Call notifications",
      });
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

interface CreateAlertFormProps {
  initialPair?: string;
}

export function CreateAlertForm({ initialPair }: CreateAlertFormProps) {
  const router = useRouter();
  const { createAlert } = useObserverAlerts();
  const { data: snapshot } = useObserverSnapshot(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      pair: initialPair ? normalizePair(initialPair) : pairs[0] ?? "EUR/USD",
      target_price: "",
      condition: "above",
      channels: ["email"],
      email: "",
      phone: "",
    },
  });

  const selectedPair = form.watch("pair");
  const selectedChannels = form.watch("channels");
  const livePrice = selectedPair ? pairPriceMap.get(selectedPair) : undefined;

  async function onSubmit(values: AlertFormValues) {
    setIsSubmitting(true);

    try {
      const price = parseNumericString(values.target_price);

      for (const channel of values.channels) {
        await createAlert({
          pair: normalizePair(values.pair).replace("/", ""),
          target_price: price,
          condition: values.condition,
          channel: channel as AlertChannel,
          email: channel === "email" ? values.email : undefined,
          phone: channel === "sms" || channel === "call" ? values.phone : undefined,
        });
      }

      if (values.channels.length > 1) {
        toast.success(`${values.channels.length} alerts created successfully`);
      }

      router.push("/dashboard");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create alert");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md items-center justify-center px-4 py-8">
      <Card className="w-full overflow-hidden border-primary/15 bg-slate-950 text-slate-50 shadow-2xl">
        <CardHeader className="border-b border-slate-800 pb-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-blue-500/10 p-2 text-blue-400">
                <BellAlertIcon className="h-5 w-5" />
              </div>
              <CardTitle className="text-2xl font-semibold">Create New Alert</CardTitle>
            </div>
            <Link
              href="/dashboard"
              className="rounded-full p-2 text-slate-400 transition hover:bg-slate-900 hover:text-white"
              aria-label="Close create alert form"
            >
              <XMarkIcon className="h-5 w-5" />
            </Link>
          </div>
        </CardHeader>

        <CardContent className="p-5">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <FormField
                control={form.control}
                name="pair"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-300">Select Pair</FormLabel>
                    <FormControl>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger className="h-12 border-slate-800 bg-slate-900 text-slate-100">
                          <SelectValue placeholder="Choose a pair" />
                        </SelectTrigger>
                        <SelectContent>
                          {pairs.map((pair) => (
                            <SelectItem key={pair} value={pair}>
                              {formatPairLabel(pair)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="target_price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-300">Target Price</FormLabel>
                    <FormControl>
                      <InputGroup className="h-12 border-slate-800 bg-slate-950">
                        <InputGroupInput
                          inputMode="decimal"
                          placeholder={livePrice ? livePrice.toString() : "1.0845"}
                          className="h-12 text-base text-slate-100"
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
                    <FormLabel className="text-slate-300">Condition</FormLabel>
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
                                ? "border-blue-500/40 bg-blue-500/10 text-white"
                                : "border-slate-800 bg-slate-900/60 text-slate-200 hover:border-slate-700"
                            )}
                          >
                            <span
                              className={cn(
                                "flex h-5 w-5 items-center justify-center rounded-full border",
                                active ? "border-blue-400" : "border-slate-600"
                              )}
                            >
                              <span
                                className={cn(
                                  "h-2.5 w-2.5 rounded-full",
                                  active ? "bg-white" : "bg-transparent"
                                )}
                              />
                            </span>
                            <span className="space-y-1">
                              <span className="block text-sm font-medium">{option.label}</span>
                              <span className="block text-xs text-slate-400">{option.description}</span>
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
                name="channels"
                render={() => (
                  <FormItem>
                    <FormLabel className="text-slate-300">Notify me via</FormLabel>
                    <div className="flex flex-wrap gap-4">
                      {channelOptions.map((channel) => (
                        <FormField
                          key={channel.value}
                          control={form.control}
                          name="channels"
                          render={({ field }) => {
                            const checked = field.value?.includes(channel.value);

                            return (
                              <FormItem className="flex flex-row items-center gap-2 space-y-0">
                                <FormControl>
                                  <Checkbox
                                    checked={checked}
                                    onCheckedChange={(nextChecked) => {
                                      if (nextChecked) {
                                        field.onChange([...field.value, channel.value]);
                                        return;
                                      }

                                      field.onChange(field.value.filter((value) => value !== channel.value));
                                    }}
                                    className="border-slate-600 data-[state=checked]:bg-white data-[state=checked]:text-slate-950"
                                  />
                                </FormControl>
                                <FormLabel className="text-sm font-normal text-slate-200">
                                  {channel.label}
                                </FormLabel>
                              </FormItem>
                            );
                          }}
                        />
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-300">Email Address</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="investor@example.com"
                        className="h-12 border-slate-800 bg-slate-950 text-slate-100 placeholder:text-slate-500"
                        {...field}
                      />
                    </FormControl>
                    {!selectedChannels.includes("email") ? null : (
                      <p className="text-xs text-slate-400">Required when Email is selected.</p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-300">Phone Number (International)</FormLabel>
                    <FormControl>
                      <InputGroup className="h-12 border-slate-800 bg-slate-950">
                        <InputGroupAddon align="inline-start" className="pl-4 text-slate-400">
                          <PhoneIcon className="h-4 w-4" />
                        </InputGroupAddon>
                        <InputGroupInput
                          placeholder="+1 234 567 8900"
                          className="h-12 text-base text-slate-100"
                          {...field}
                        />
                      </InputGroup>
                    </FormControl>
                    {(selectedChannels.includes("sms") || selectedChannels.includes("call")) ? (
                      <p className="text-xs text-slate-400">Required for SMS and Voice Call alerts.</p>
                    ) : null}
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-3 border-t border-slate-800 pt-5">
                <Button
                  type="submit"
                  className="h-12 w-full bg-blue-500 text-white hover:bg-blue-400"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Creating Alert..." : "Create Alert"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 w-full border-slate-800 bg-transparent text-slate-200 hover:bg-slate-900 hover:text-white"
                  onClick={() => router.push("/dashboard")}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
