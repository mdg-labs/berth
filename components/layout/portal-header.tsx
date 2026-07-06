// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { LogOutIcon, UserIcon } from "lucide-react";

import { useAuthUser } from "@/components/providers/auth-guard";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { CommandPalette } from "@/components/command-palette/command-palette";
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

function currentProjectFromPath(pathname: string): string | undefined {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] === "p" && segments[1]) {
    return decodeURIComponent(segments[1]);
  }
  return undefined;
}

export function PortalHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { data } = useAuthUser();
  const user = data?.user;
  const currentProject = currentProjectFromPath(pathname);

  async function handleLogout() {
    await apiFetch("/api/auth/logout", { method: "POST" });
    queryClient.clear();
    router.replace("/login");
  }

  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex h-auto min-h-14 max-w-6xl flex-wrap items-center gap-2 px-3 py-2 sm:gap-4 sm:px-4 sm:py-0">
        <Link
          href="/projects"
          className="shrink-0 text-sm font-semibold tracking-tight"
        >
          Berth
        </Link>
        <Separator orientation="vertical" className="hidden h-6 sm:block" />
        <div className="order-3 min-w-0 basis-full sm:order-none sm:flex-1 sm:basis-auto">
          <BreadcrumbNav />
        </div>
        <div className="ms-auto flex shrink-0 items-center gap-1 sm:gap-2">
          <CommandPalette currentProject={currentProject} />
          {user?.systemRole === "admin" ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                render={<Link href="/admin" />}
              >
                Admin
              </Button>
              <Badge variant="secondary" className="hidden sm:inline-flex">
                Admin
              </Badge>
            </>
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
