"use client"

import * as React from "react"
import Image from "next/image"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

interface TeamSwitcherProps {
  team: {
    name: string
    logo: string
    plan: string
  }
}

export function TeamSwitcher({ team }: TeamSwitcherProps) {
  if (!team) {
    return null
  }

  return (
    <SidebarMenu className="text-white">
      <SidebarMenuItem >
        <SidebarMenuButton
          size="lg"
          className="pointer-events-none"
        >
          <div className="border flex aspect-square size-12 items-center justify-center rounded-lg overflow-hidden bg-slate-50" >
            <Image
              src={team.logo}
              alt={team.name}
              width={42}
              height={42}
              className="object-contain"
              unoptimized
            />
          </div>
          <div className="grid flex-1 text-left text-base leading-tight">
            <span className="truncate font-medium">{team.name}</span>
            <span className="truncate text-sm">{team.plan}</span>
          </div>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
