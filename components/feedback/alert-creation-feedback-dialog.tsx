"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { Session } from "next-auth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { submitFeedback } from "@/lib/api/feedback";

interface AlertCreationFeedbackDialogProps {
  open: boolean;
  session: Session | null;
  onComplete: () => void;
}

export function AlertCreationFeedbackDialog({
  open,
  session,
  onComplete,
}: AlertCreationFeedbackDialogProps) {
  const [enjoying, setEnjoying] = useState<boolean | null>(null);
  const [improvements, setImprovements] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (enjoying === null || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    try {
      const ok = await submitFeedback(session, {
        enjoying,
        improvements: improvements.trim() || undefined,
      });
      if (!ok) {
        toast.error("Could not submit feedback. Please try again.");
        return;
      }
    } finally {
      setIsSubmitting(false);
    }

    setEnjoying(null);
    setImprovements("");
    onComplete();
  };

  return (
    <Dialog open={open} onOpenChange={() => undefined}>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Are you enjoying the web-app?</DialogTitle>
          <DialogDescription>
            Your feedback helps us improve FX Alert.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Button
              type="button"
              variant={enjoying === true ? "default" : "outline"}
              className={cn("h-11", enjoying === true && "ring-2 ring-primary/40")}
              onClick={() => setEnjoying(true)}
            >
              Yes
            </Button>
            <Button
              type="button"
              variant={enjoying === false ? "default" : "outline"}
              className={cn("h-11", enjoying === false && "ring-2 ring-primary/40")}
              onClick={() => setEnjoying(false)}
            >
              No
            </Button>
          </div>

          <Textarea
            value={improvements}
            onChange={(event) => setImprovements(event.target.value)}
            placeholder="Any improvements you want."
            rows={4}
            className="resize-none"
          />
        </div>

        <DialogFooter>
          <Button
            type="button"
            className="w-full sm:w-auto"
            disabled={enjoying === null || isSubmitting}
            onClick={() => void handleSubmit()}
          >
            {isSubmitting ? (
              <>
                <Spinner className="mr-2 size-4" />
                Submitting...
              </>
            ) : (
              "Submit"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
