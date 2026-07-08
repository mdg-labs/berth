// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import { useTranslations } from "next-intl";
import {
  ClipboardListIcon,
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
import { Link, usePathname } from "@/lib/i18n/navigation";

function currentRepositoryFromPath(pathname: string): string | undefined {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] === "r" && segments[1]) {
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
  const t = useTranslations("navigation");
  const { data } = useAuthUser();
  const user = data?.user;
  const repositoryName = currentRepositoryFromPath(pathname);
  const repositoryPath = repositoryName
    ? `/r/${encodeURIComponent(repositoryName)}`
    : undefined;

  const isRepositoriesActive = pathname === "/repositories";
  const isCatalogActive = Boolean(
    repositoryPath && (pathname === repositoryPath || pathname.startsWith(`${repositoryPath}/i`)),
  );
  const isSettingsActive = Boolean(
    repositoryPath && pathname === `${repositoryPath}/settings`,
  );
  const isAdminUsersActive = pathname === "/admin";
  const isAdminGcActive = pathname === "/admin/gc";
  const isAdminAuditActive = pathname === "/admin/audit";

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="flex h-16 shrink-0 items-center border-b border-sidebar-border p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              render={<Link href="/repositories" />}
              tooltip={t("appName")}
            >
              <span className="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary font-semibold text-sidebar-primary-foreground">
                B
              </span>
              <span className="truncate font-semibold">{t("appName")}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t("groups.main")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={isRepositoriesActive}
                  render={<Link href="/repositories" />}
                  tooltip={t("repositories")}
                >
                  <FolderKanbanIcon />
                  <span>{t("repositories")}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {repositoryName && repositoryPath ? (
          <SidebarGroup>
            <SidebarGroupLabel>{titleCase(repositoryName)}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={isCatalogActive}
                    render={<Link href={repositoryPath} />}
                    tooltip={t("images")}
                  >
                    <PackageIcon />
                    <span>{t("images")}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={isSettingsActive}
                    render={<Link href={`${repositoryPath}/settings`} />}
                    tooltip={t("settings")}
                  >
                    <SettingsIcon />
                    <span>{t("settings")}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}

        {user?.systemRole === "admin" ? (
          <SidebarGroup>
            <SidebarGroupLabel>{t("groups.admin")}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={isAdminUsersActive}
                    render={<Link href="/admin" />}
                    tooltip={t("users")}
                  >
                    <UsersIcon />
                    <span>{t("users")}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={isAdminGcActive}
                    render={<Link href="/admin/gc" />}
                    tooltip={t("garbageCollection")}
                  >
                    <Trash2Icon />
                    <span>{t("garbageCollection")}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={isAdminAuditActive}
                    render={<Link href="/admin/audit" />}
                    tooltip={t("auditLog")}
                  >
                    <ClipboardListIcon />
                    <span>{t("auditLog")}</span>
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
