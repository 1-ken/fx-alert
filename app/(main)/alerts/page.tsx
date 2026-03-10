"use client";

import { useSearchParams } from "next/navigation";
import { CreateAlertForm } from "@/components/observer/create-alert-form";

export default function AlertsPage() {
  const searchParams = useSearchParams();
  const initialPair = searchParams.get("pair") ?? undefined;

  return <CreateAlertForm initialPair={initialPair} />;
}