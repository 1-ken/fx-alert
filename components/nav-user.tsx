"use client"

import {
  ArrowRightOnRectangleIcon,
} from "@heroicons/react/24/outline"

import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

export function NavUser() {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          size="lg"
          className="bg-red-700 text-primary-foreground hover:bg-red cursor-pointer dark:bg-red-800 dark:hover:bg-red-900 dark:text-white"
          onClick={async () => {
            const { signOut } = await import("next-auth/react")
            signOut({ callbackUrl: "/login" })
          }}
        >
          <ArrowRightOnRectangleIcon className="size-4" />
          <span>Log out</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
