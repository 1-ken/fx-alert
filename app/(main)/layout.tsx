"use client";

import React from "react";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { BottomNav } from "@/components/mobile/bottom-nav";
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Spinner } from "@/components/ui/spinner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArrowRightOnRectangleIcon, UserIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { signOut } from "next-auth/react";

function HeaderContent() {
  const { toggleSidebar } = useSidebar();
  const { data: session } = useSession();

  return (
    <header className="sticky z-50 bg-slate-50 top-0 flex h-16 shrink-0 items-center justify-between gap-2 px-4 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12  dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
      <div className="flex items-center gap-2">
        {/* Mobile: App Logo and Text */}
        <button
          onClick={toggleSidebar}
          className="flex items-center gap-2 md:hidden hover:opacity-80 transition-opacity"
        >
          <div className="relative w-8 h-8 shrink-0 bg-slate-50">
            <Image
              src="/icons/defoca-logo.webp"
              alt="Logo"
              fill
              sizes="32px"
              className="object-contain"
              unoptimized
            />
          </div>
          <span className="font-semibold text-2xl ml-2  dark:text-gray-100">App Name</span>
        </button>
        {/* Desktop: Sidebar Trigger */}
        <SidebarTrigger className="-ml-1 hidden md:flex text-gray-900 md:text-slate-50 dark:text-gray-100 hover:text-gray-700 dark:hover:text-gray-300" />
      </div>
      <div className="flex items-center gap-3">
        {session?.branch?.name && (
          <div className="text-xl font-medium uppercase hidden md:block">
            {session.branch.name}
          </div>
        )}
        {/* Mobile Profile Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="md:hidden bg-amber-500"
            >
              <UserIcon className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              {session?.user?.name || 'User'}
            </DropdownMenuLabel>
            {session?.user?.phone && (
              <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                {session.user.phone}
              </DropdownMenuLabel>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="cursor-pointer"
            >
              <ArrowRightOnRectangleIcon className="mr-2 h-4 w-4" />
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "loading") return; // Still loading

    if (!session) {
      router.push("/login");
      return;
    }
  }, [session, status, router]);

  // Show loading while checking authentication
  if (status === "loading") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Spinner className="size-4 mx-auto" />
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Don't render anything if user is not authenticated
  if (!session) {
    return null;
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <HeaderContent />
        <div className="flex flex-1 flex-col gap-4 p-4 px-2 pt-4 pb-20 md:px-4 md:pb-4">
          {children}
        </div>
      </SidebarInset>
      <BottomNav />
    </SidebarProvider>
  );
}
