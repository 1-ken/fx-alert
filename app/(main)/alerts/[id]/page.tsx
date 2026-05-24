"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
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

export default function AlertDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const alertId = params.id;
  const { alert, isInitialLoading, error } = useObserverAlert(alertId);
  const { updateAlert } = useObserverAlerts();

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
          : {
              threshold: Number(targetPrice || alert.threshold),
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

      <Card>
        <CardHeader>
          <CardTitle>{alert.pair}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="level">
              {alert.alert_type === "price" ? "Target price" : "Threshold"}
            </Label>
            <Input
              id="level"
              type="number"
              defaultValue={String(alert.target_price ?? alert.threshold ?? "")}
              onChange={(e) => setTargetPrice(e.target.value)}
            />
          </div>
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
