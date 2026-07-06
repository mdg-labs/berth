// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import { usePathname } from "next/navigation";

import { ThemeToggle } from "@/components/layout/theme-toggle";
import { CommandPalette } from "@/components/command-palette/command-palette";
import { BreadcrumbNav } from "@/components/layout/breadcrumb-nav";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

function currentRepositoryFromPath(pathname: string): string | undefined {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] === "r" && segments[1]) {
    return decodeURIComponent(segments[1]);
  }
  return undefined;
}

export function PortalHeader() {
  const pathname = usePathname();
  const currentRepository = currentRepositoryFromPath(pathname);

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b bg-background px-4">
      <SidebarTrigger className="-ms-1" />
      <Separator orientation="vertical" className="h-6" />
      <div className="min-w-0 flex-1">
        <BreadcrumbNav />
      </div>
      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <CommandPalette currentRepository={currentRepository} />
        <ThemeToggle />
      </div>
    </header>
  );
}
