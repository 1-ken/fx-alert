"use client";

import Link from "next/link";
import { BellAlertIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";

export function GlobalCreateAlertFab() {
  return (
    <div className="fixed bottom-20 right-4 z-40 md:bottom-6">
      <Button asChild size="lg" className="h-auto rounded-full px-4 py-3 shadow-xl">
        <Link href="/alerts" className="flex items-center gap-3" aria-label="Create alert">
          <BellAlertIcon className="h-5 w-5" />
          <span className="hidden sm:inline">Create Alert</span>
        </Link>
      </Button>
    </div>
  );
}
