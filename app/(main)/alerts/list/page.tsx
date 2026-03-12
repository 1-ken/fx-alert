"use client";

import { useSearchParams } from "next/navigation";
import { AlertsListPage } from "@/components/alerts/alerts-list-page";

export default function AlertsListRoutePage() {
  const searchParams = useSearchParams();
  const status = searchParams.get("status") ?? "all";

  return <AlertsListPage initialStatus={status} />;
}
