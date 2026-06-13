"use client";

import { useState } from "react";
import { Session } from "next-auth";

export interface FeedbackInput {
  enjoying: boolean;
  improvements?: string;
}

export async function submitFeedback(
  session: Session | null,
  input: FeedbackInput,
): Promise<boolean> {
  if (!session?.user?.id) {
    return false;
  }

  try {
    const token = (session as { accessToken?: string }).accessToken;
    const response = await fetch("/api/feedback", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token || ""}`,
      },
      body: JSON.stringify({
        enjoying: input.enjoying,
        improvements: input.improvements?.trim() || undefined,
        source: "alert_create",
      }),
      cache: "no-store",
    });

    return response.ok;
  } catch (error) {
    console.error("[submitFeedback] failed:", error);
    return false;
  }
}
