"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getAdminPanelPath } from "@/lib/admin-config";

/**
 * Redirects to the secret admin route or shows setup instructions.
 */
export default function AdminIndexPage() {
  const router = useRouter();
  const adminPath = getAdminPanelPath();

  useEffect(() => {
    if (adminPath) {
      router.replace(adminPath);
    }
  }, [adminPath, router]);

  if (adminPath) {
    return (
      <p className="p-6 text-sm text-muted-foreground">Redirecting to admin…</p>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-2 p-6">
      <h1 className="text-lg font-semibold">Admin not configured</h1>
      <p className="text-sm text-muted-foreground">
        Set <code className="text-xs">NEXT_PUBLIC_ADMIN_PATH_SECRET</code> in{" "}
        <code className="text-xs">.env.local</code> and restart the dev server.
      </p>
    </div>
  );
}
