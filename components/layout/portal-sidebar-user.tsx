// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ChevronsUpDownIcon, LogOutIcon, UserIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { useAuthUser } from "@/components/providers/auth-guard";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import {
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { apiFetch } from "@/lib/api/client";
import { Link, useRouter } from "@/lib/i18n/navigation";

function userInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
  }

  return name.slice(0, 2).toUpperCase();
}

export function PortalSidebarUser() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const t = useTranslations("navigation");
  const { data } = useAuthUser();
  const user = data?.user;

  if (!user) {
    return null;
  }

  async function handleLogout() {
    await apiFetch("/api/auth/logout", { method: "POST" });
    queryClient.clear();
    router.replace("/login");
  }

  return (
    <SidebarFooter className="border-t border-sidebar-border">
      <SidebarMenu>
        <SidebarMenuItem>
          <Menu>
            <MenuTrigger
              render={
                <SidebarMenuButton
                  size="lg"
                  aria-label={t("accountMenu")}
                  tooltip={user.name}
                />
              }
            >
              <Avatar className="size-8 rounded-lg">
                <AvatarFallback className="rounded-lg">
                  {userInitials(user.name)}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user.name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {user.email}
                </span>
              </div>
              <ChevronsUpDownIcon className="ms-auto size-4 text-muted-foreground" />
            </MenuTrigger>
            <MenuPopup side="top" align="start" className="w-56">
              <MenuItem render={<Link href="/profile" />}>
                <UserIcon className="size-4" />
                {t("profile")}
              </MenuItem>
              <MenuSeparator />
              <div className="px-2 py-1.5 text-sm">
                <p className="font-medium">{user.name}</p>
                <p className="text-muted-foreground">{user.email}</p>
              </div>
              <MenuSeparator />
              <MenuItem onClick={() => void handleLogout()}>
                <LogOutIcon className="size-4" />
                {t("signOut")}
              </MenuItem>
            </MenuPopup>
          </Menu>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
  );
}
