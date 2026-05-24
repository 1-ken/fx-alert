"use client";

import { notFound, useParams } from "next/navigation";
import { AdminPanel } from "@/components/admin/admin-panel";

/**
 * Secret admin panel with SMS OTP login and tabbed metrics.
 */
export default function AdminPanelPage() {
  const params = useParams<{ secret: string }>();
  const expectedSecret = process.env.NEXT_PUBLIC_ADMIN_PATH_SECRET;

  if (!expectedSecret || params.secret !== expectedSecret) {
    notFound();
  }

  return <AdminPanel />;
}
