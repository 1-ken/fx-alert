"use client";

import * as React from "react";
import { useSession } from "next-auth/react";
import {
  BellAlertIcon,
  HomeModernIcon,
  BookOpenIcon,
  CogIcon,
} from "@heroicons/react/24/outline";

import { NavMain } from "@/components/nav-main";
import { NavDocuments } from "@/components/nav-documents";
import { NavResources } from "@/components/nav-resources";
import { NavSettings } from "@/components/nav-settings";
import { NavUser } from "@/components/nav-user";
import { TeamSwitcher } from "@/components/team-switcher";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar";
import { Separator } from "./ui/separator";

// Platform section
const navMain = [
  {
    title: "Dashboard",
    url: "/dashboard",
    icon: HomeModernIcon,
    isActive: true,
  },
  {
    title: "Alerts",
    url: "/alerts",
    icon: BellAlertIcon,
  },
];

// Documents section: Add your own document types here
const documents: {
  name: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  items?: {
    title: string;
    url: string;
  }[];
}[] = [
  // Example:
  // {
  //   name: "Reports",
  //   url: "/reports",
  //   icon: DocumentTextIcon,
  //   items: [
  //     {
  //       title: "Create New",
  //       url: "/reports/create",
  //     },
  //     {
  //       title: "List",
  //       url: "/reports/list",
  //     },
  //   ],
  // },
];

// Resources section
const resources = [
  {
    name: "Documentation",
    url: "#",
    icon: BookOpenIcon,
  },
];

// Settings section: Admin only (example)
const settings = [
  {
    name: "Settings",
    url: "#",
    icon: CogIcon,
    items: [
      {
        title: "Profile",
        url: "#",
      },
      {
        title: "Preferences",
        url: "#",
      },
    ],
  },
];

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { data: session } = useSession();
  const roleName = (session as { role?: { name?: string } } | null)?.role?.name?.toLowerCase();

  // Get user data from session or use defaults
  const user = session?.user
    ? {
        name: session.user.name || "User",
        email: session.user.email || "",
        avatar: session.user.image || "",
      }
    : {
        name: "User",
        email: "",
        avatar: "",
      };

  // Team data with logo and user name
  const team = {
    name: "Your App",
    logo: "/assets/fxlogo.webp",
    plan: user.name,
  };

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="bg-maroon">
        <TeamSwitcher team={team} />
      </SidebarHeader>
      <Separator className="mt-2" />
      <SidebarContent>
        <NavMain items={navMain} />
        {documents.length > 0 && <NavDocuments documents={documents} />}
        <NavResources resources={resources} />
        {roleName === "admin" && (
          <NavSettings settings={settings} />
        )}
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
