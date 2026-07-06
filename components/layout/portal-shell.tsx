// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import { PortalHeader } from "@/components/layout/portal-header";
import { PortalSidebar } from "@/components/layout/portal-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

type PortalShellProps = {
  children: React.ReactNode;
};

export function PortalShell({ children }: PortalShellProps) {
  return (
    <TooltipProvider>
      <SidebarProvider>
        <PortalSidebar />
        <SidebarInset className="min-h-0">
          <PortalHeader />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
            <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col">
              {children}
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
