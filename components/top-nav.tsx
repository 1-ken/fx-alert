"use client";

import React from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  HomeModernIcon,
  BellAlertIcon,
  CogIcon,
  ArrowRightOnRectangleIcon,
  ChartBarSquareIcon,
} from "@heroicons/react/24/outline";

import { Button } from "@/components/ui/button";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Separator } from "@/components/ui/separator";

interface NavItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  {
    title: "Dashboard",
    url: "/dashboard",
    icon: HomeModernIcon,
  },
  {
    title: "Alerts",
    url: "/alerts/list",
    icon: BellAlertIcon,
  },
  {
    title: "Backtest",
    url: "/backtest",
    icon: ChartBarSquareIcon,
  },
  {
    title: "Settings",
    url: "/settings",
    icon: CogIcon,
  },
];

function NavLink({
  item,
  isActive,
}: {
  item: NavItem;
  isActive: boolean;
}) {
  const Icon = item.icon;
  
  return (
    <Link
      href={item.url}
      className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
        isActive
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
      title={item.title}
    >
      <Icon className="h-4 w-4" />
      <span>{item.title}</span>
    </Link>
  );
}

function UserMenu() {
  const { data: session } = useSession();

  return (
    <div className="flex items-center gap-3">
      <div className="text-right">
        <p className="text-sm font-medium text-foreground">
          {session?.user?.name || "User"}
        </p>
        <p className="text-xs text-muted-foreground">
          {session?.user?.email || ""}
        </p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-900/20"
        onClick={async () => {
          const { signOut } = await import("next-auth/react");
          signOut({ callbackUrl: "/login" });
        }}
        title="Log out"
      >
        <ArrowRightOnRectangleIcon className="h-4 w-4" />
      </Button>
    </div>
  );
}

export function TopNav() {
  const pathname = usePathname();

  // Determine which route is active
  // Special handling: /alerts and /alerts/list both highlight Alerts
  const getIsActive = (url: string) => {
    if (url === "/alerts/list") {
      return pathname.startsWith("/alerts");
    }
    return pathname === url;
  };

  return (
    <div className="hidden md:flex items-center justify-between h-16 px-4 bg-background border-b border-border">
      {/* Left side: Logo/Branding and Navigation Links */}
      <div className="flex items-center gap-8">
        <div className="text-lg font-bold">FX Alert</div>
        
        <Separator orientation="vertical" className="h-6" />
        
        <nav className="flex items-center gap-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.url}
              item={item}
              isActive={getIsActive(item.url)}
            />
          ))}
        </nav>
      </div>

      {/* Right side: Actions and User Menu */}
      <div className="flex items-center gap-4">
        <Button asChild size="sm" variant="default">
          <Link href="/alerts" className="flex items-center gap-2">
            <BellAlertIcon className="h-4 w-4" />
            <span>Create Alert</span>
          </Link>
        </Button>

        <Separator orientation="vertical" className="h-6" />

        <ThemeSwitcher />

        <Separator orientation="vertical" className="h-6" />

        <UserMenu />
      </div>
    </div>
  );
}
