"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useObserverAlert, useObserverAlerts } from "@/hooks/alerts/use-alerts";
import {
  CALL_CUSTOM_MESSAGE_MAX_CHARS,
  CUSTOM_MESSAGE_MAX_CHARS,
} from "@/lib/alert-preferences";
import { buildInstrumentPairUrl } from "@/lib/instrument-navigation";
import { cn } from "@/lib/utils";

function formatPairLabel(pair: string): string {
  const cleanPair = pair.replace("/", "").toUpperCase();
  if (cleanPair.length === 6) {
    return `${cleanPair.slice(0, 3)}/${cleanPair.slice(3)}`;
  }
  return cleanPair;
}

const HIGHLIGHT_MS = 3_000;

export default function AlertDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const alertId = params.id;
  const { alert, isInitialLoading, error } = useObserverAlert(alertId);
  const { updateAlert } = useObserverAlerts();
  const cardRef = useRef<HTMLDivElement>(null);
  const highlightStartedRef = useRef(false);
  const [highlight, setHighlight] = useState(false);

  const [targetPrice, setTargetPrice] = useState("");
  const [customMessage, setCustomMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const customMessageMaxChars = useMemo(
    () => (alert?.channel === "call" ? CALL_CUSTOM_MESSAGE_MAX_CHARS : CUSTOM_MESSAGE_MAX_CHARS),
    [alert?.channel],
  );

  useEffect(() => {
    if (alert) {
      setCustomMessage(alert.custom_message ?? "");
    }
  }, [alert]);

  useEffect(() => {
    if (!alert || highlightStartedRef.current) {
      return;
    }
    if (searchParams.get("highlight") !== "1") {
      return;
    }
    highlightStartedRef.current = true;
    setHighlight(true);
    const scrollTimer = window.setTimeout(() => {
      cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);
    router.replace(`/alerts/${alert.id}`, { scroll: false });
    const clearHighlight = window.setTimeout(() => setHighlight(false), HIGHLIGHT_MS);
    return () => {
      window.clearTimeout(scrollTimer);
      window.clearTimeout(clearHighlight);
    };
    // Only when alert identity is ready; do not re-run on searchParams after replace.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot highlight from deep link
  }, [alert?.id]);

  if (isInitialLoading && !alert) {
    return <p className="p-6 text-sm text-muted-foreground">Loading alert...</p>;
  }

  if (error || !alert) {
    return (
      <div className="p-6">
        <p className="text-sm text-destructive">Alert not found.</p>
        <Button variant="link" asChild className="mt-2 px-0">
          <Link href="/alerts/list">Back to list</Link>
        </Button>
      </div>
    );
  }

  const onSave = async () => {
    const trimmedMessage = (customMessage || alert.custom_message || "").trim();
    if (trimmedMessage.length > customMessageMaxChars) {
      toast.error(
        alert.channel === "call"
          ? `Custom message must be ${CALL_CUSTOM_MESSAGE_MAX_CHARS} characters or less for call alerts`
          : `Custom message must be ${CUSTOM_MESSAGE_MAX_CHARS} characters or less`,
      );
      return;
    }

    setIsSaving(true);
    try {
      const body =
        alert.alert_type === "price"
          ? {
              target_price: Number(targetPrice || alert.target_price),
              custom_message: trimmedMessage,
            }
          : alert.alert_type === "candle_close"
            ? {
                threshold: Number(targetPrice || alert.threshold),
                custom_message: trimmedMessage,
              }
            : {
                custom_message: trimmedMessage,
              };
      await updateAlert(alert.id, body);
      router.push("/alerts/list");
    } catch {
      // toast handled in hook
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg space-y-4 p-4 md:p-6">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/alerts/list">
          <ArrowLeftIcon className="mr-1 h-4 w-4" />
          Back
        </Link>
      </Button>

      <Card
        ref={cardRef}
        className={cn(
          "transition-[box-shadow,ring-color] duration-300",
          highlight && "animate-pulse ring-2 ring-primary ring-offset-2 ring-offset-background",
        )}
      >
        <CardHeader className="gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>
              <Link
                href={buildInstrumentPairUrl(alert.pair)}
                className="text-primary underline-offset-4 hover:underline"
              >
                {formatPairLabel(alert.pair)}
              </Link>
            </CardTitle>
            {alert.status === "triggered" ? (
              <Badge className="bg-primary text-primary-foreground">Triggered</Badge>
            ) : (
              <Badge variant="secondary" className="capitalize">
                {alert.status}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground capitalize">
            {alert.alert_type.replaceAll("_", " ")}
            {alert.channel ? ` · ${alert.channel}` : ""}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="level">
              {alert.alert_type === "price"
                ? "Target price"
                : alert.alert_type === "candle_close"
                  ? "Threshold"
                  : "Type"}
            </Label>
            {alert.alert_type === "market_structure" ? (
              <p className="text-sm">
                {alert.interval} · {alert.structure_event} · {alert.structure_direction}
                {alert.chain_id || alert.depends_on_alert_id
                  ? ` · queue step ${(alert.sequence_index ?? 0) + 1}${
                      alert.status === "waiting" ? " (waiting)" : ""
                    }`
                  : ""}
              </p>
            ) : (
              <Input
                id="level"
                type="number"
                defaultValue={String(alert.target_price ?? alert.threshold ?? "")}
                onChange={(e) => setTargetPrice(e.target.value)}
              />
            )}
          </div>
          {alert.expires_at ? (
            <div className="space-y-1">
              <Label>Expires</Label>
              <p className="text-sm text-muted-foreground">
                {new Date(alert.expires_at).toLocaleString()}
              </p>
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="message">Custom message</Label>
            <Textarea
              id="message"
              className="min-h-20 resize-none"
              value={customMessage}
              maxLength={customMessageMaxChars}
              onChange={(e) => setCustomMessage(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {alert.channel === "call"
                ? `Call alerts: max ${CALL_CUSTOM_MESSAGE_MAX_CHARS} characters (~1 minute when spoken).`
                : `Max ${CUSTOM_MESSAGE_MAX_CHARS} characters.`}{" "}
              <span className="tabular-nums">
                {customMessage.length}/{customMessageMaxChars}
              </span>
            </p>
          </div>
          <Button onClick={onSave} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save changes"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
