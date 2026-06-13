"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BellAlertIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";

export function GlobalCreateAlertFab() {
  const pathname = usePathname();
  const isPairDetailPage = /^\/instruments\/[^/]+$/.test(pathname);

  if (isPairDetailPage) {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 pointer-events-none">
      <div className="mx-auto flex w-full max-w-4xl justify-end px-4 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-6">
        <div className="pointer-events-auto">
          <Button asChild size="lg" className="h-auto rounded-full px-4 py-3 shadow-xl">
            <Link href="/alerts" className="flex items-center gap-3" aria-label="Create alert">
              <BellAlertIcon className="h-5 w-5" />
              <span className="hidden sm:inline">Create Alert</span>
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
