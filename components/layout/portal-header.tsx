// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { LogOutIcon, UserIcon } from "lucide-react";

import { useAuthUser } from "@/components/providers/auth-guard";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { BreadcrumbNav } from "@/components/layout/breadcrumb-nav";
import { apiFetch } from "@/lib/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";

export function PortalHeader() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data } = useAuthUser();
  const user = data?.user;

  async function handleLogout() {
    await apiFetch("/api/auth/logout", { method: "POST" });
    queryClient.clear();
    router.replace("/login");
  }

  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
        <Link href="/projects" className="text-sm font-semibold tracking-tight">
          Berth
        </Link>
        <Separator orientation="vertical" className="h-6" />
        <div className="min-w-0 flex-1">
          <BreadcrumbNav />
        </div>
        <div className="flex items-center gap-2">
          {user?.systemRole === "admin" ? (
            <Badge variant="secondary">Admin</Badge>
          ) : null}
          <ThemeToggle />
          <Menu>
            <MenuTrigger
              render={
                <Button variant="ghost" size="icon-sm" aria-label="Account menu" />
              }
            >
              <UserIcon className="size-4" />
            </MenuTrigger>
            <MenuPopup align="end">
              <div className="px-2 py-1.5 text-sm">
                <p className="font-medium">{user?.name}</p>
                <p className="text-muted-foreground">{user?.email}</p>
              </div>
              <MenuSeparator />
              <MenuItem onClick={() => void handleLogout()}>
                <LogOutIcon className="size-4" />
                Sign out
              </MenuItem>
            </MenuPopup>
          </Menu>
        </div>
      </div>
    </header>
  );
}
