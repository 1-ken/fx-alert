"use client";

import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";

export default function DashboardPage() {
  return (
    <div className="flex min-h-[50vh] flex-col gap-4 p-4">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <div>
        <Button onClick={() => signOut({ callbackUrl: "/login" })}>
          Sign out
        </Button>
      </div>
    </div>
  );
}
