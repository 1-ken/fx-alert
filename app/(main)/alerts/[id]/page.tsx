"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useObserverAlert, useObserverAlerts } from "@/hooks/alerts/use-alerts";

export default function AlertDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const alertId = params.id;
  const { alert, isLoading, error } = useObserverAlert(alertId);
  const { updateAlert } = useObserverAlerts();

  const [targetPrice, setTargetPrice] = useState("");
  const [customMessage, setCustomMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  if (isLoading) {
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
    setIsSaving(true);
    try {
      const body =
        alert.alert_type === "price"
          ? {
              target_price: Number(targetPrice || alert.target_price),
              custom_message: customMessage || alert.custom_message,
            }
          : {
              threshold: Number(targetPrice || alert.threshold),
              custom_message: customMessage || alert.custom_message,
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
            <Input
              id="message"
              defaultValue={alert.custom_message}
              onChange={(e) => setCustomMessage(e.target.value)}
            />
          </div>
          <Button onClick={onSave} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save changes"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
