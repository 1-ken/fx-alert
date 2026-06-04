"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { CreateAlertForm } from "@/components/alerts/create-alert-form";
import type { ChartAlertDraft } from "@/components/charts/interactive-trading-chart";

type ChartAlertSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: ChartAlertDraft | null;
};

/**
 * Side sheet for creating alerts prefilled from chart interactions.
 */
export function ChartAlertSheet({ open, onOpenChange, draft }: ChartAlertSheetProps) {
  if (!draft) {
    return null;
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>Create alert for {draft.pair}</SheetTitle>
          <SheetDescription>
            Prefilled from your chart selection at {draft.price.toString()}.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4 pb-6">
          <CreateAlertForm
            initialPair={draft.pair}
            initialAlertType={draft.alertType}
            initialInterval={draft.interval}
            initialNotifyVia={["sound"]}
            initialTargetPrice={
              draft.alertType === "price" ? draft.price.toString() : undefined
            }
            initialThreshold={
              draft.alertType === "candle_close" ? draft.price.toString() : undefined
            }
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
