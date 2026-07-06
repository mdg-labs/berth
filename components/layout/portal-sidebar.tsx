// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FolderKanbanIcon,
  PackageIcon,
  SettingsIcon,
  Trash2Icon,
  UsersIcon,
} from "lucide-react";

import { useAuthUser } from "@/components/providers/auth-guard";
import { PortalSidebarUser } from "@/components/layout/portal-sidebar-user";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

function currentProjectFromPath(pathname: string): string | undefined {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] === "p" && segments[1]) {
    return decodeURIComponent(segments[1]);
  }
  return undefined;
}

function titleCase(segment: string): string {
  return segment
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function PortalSidebar() {
  const pathname = usePathname();
  const { data } = useAuthUser();
  const user = data?.user;
  const projectName = currentProjectFromPath(pathname);
  const projectPath = projectName
    ? `/p/${encodeURIComponent(projectName)}`
    : undefined;

  const isProjectsActive = pathname === "/projects";
  const isCatalogActive = Boolean(
    projectPath && (pathname === projectPath || pathname.startsWith(`${projectPath}/r`)),
  );
  const isSettingsActive = Boolean(
    projectPath && pathname === `${projectPath}/settings`,
  );
  const isAdminUsersActive = pathname === "/admin";
  const isAdminGcActive = pathname === "/admin/gc";

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="flex h-16 shrink-0 items-center border-b border-sidebar-border p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              render={<Link href="/projects" />}
              tooltip="Berth"
            >
              <span className="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary font-semibold text-sidebar-primary-foreground">
                B
              </span>
              <span className="truncate font-semibold">Berth</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Main</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={isProjectsActive}
                  render={<Link href="/projects" />}
                  tooltip="Projects"
                >
                  <FolderKanbanIcon />
                  <span>Projects</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {projectName && projectPath ? (
          <SidebarGroup>
            <SidebarGroupLabel>{titleCase(projectName)}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={isCatalogActive}
                    render={<Link href={projectPath} />}
                    tooltip="Catalog"
                  >
                    <PackageIcon />
                    <span>Catalog</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={isSettingsActive}
                    render={<Link href={`${projectPath}/settings`} />}
                    tooltip="Settings"
                  >
                    <SettingsIcon />
                    <span>Settings</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}

        {user?.systemRole === "admin" ? (
          <SidebarGroup>
            <SidebarGroupLabel>Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={isAdminUsersActive}
                    render={<Link href="/admin" />}
                    tooltip="Users"
                  >
                    <UsersIcon />
                    <span>Users</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={isAdminGcActive}
                    render={<Link href="/admin/gc" />}
                    tooltip="Garbage collection"
                  >
                    <Trash2Icon />
                    <span>Garbage collection</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}
      </SidebarContent>
      <PortalSidebarUser />
      <SidebarRail />
    </Sidebar>
  );
}
