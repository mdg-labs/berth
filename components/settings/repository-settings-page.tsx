// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import Link from "next/link";
import { ScrollTextIcon, SettingsIcon, UsersIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { RepositoryAuditSection } from "@/components/settings/repository-audit-section";
import { RepositoryDangerZone } from "@/components/settings/repository-danger-zone";
import { RepositoryMembersSection } from "@/components/settings/repository-members-section";
import { RepositoryRolesMatrix } from "@/components/settings/repository-roles-matrix";
import { RepositoryVisibilitySection } from "@/components/settings/repository-visibility-section";
import { useAuthUser } from "@/components/providers/auth-guard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { useRepositoryByName } from "@/lib/hooks/use-repository";

type RepositorySettingsPageProps = {
  repositoryName: string;
};

export function RepositorySettingsPage({ repositoryName }: RepositorySettingsPageProps) {
  const t = useTranslations("settings");
  const { data: authData } = useAuthUser();
  const repositoryQuery = useRepositoryByName(repositoryName);

  const canManage =
    authData?.user.systemRole === "admin" || repositoryQuery.data?.role === "admin";

  if (repositoryQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    );
  }

  if (repositoryQuery.isError || !repositoryQuery.data) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
        {t("repository.notFound")}
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
          {t("repository.forbidden", { name: repositoryName })}
        </div>
        <Button variant="outline" render={<Link href={`/r/${repositoryName}`} />}>
          {t("backToCatalog")}
        </Button>
      </div>
    );
  }

  const repository = repositoryQuery.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("repository.description", { name: repository.name })}
          </p>
        </div>
        <Button variant="outline" render={<Link href={`/r/${repositoryName}`} />}>
          <SettingsIcon className="size-4" />
          {t("backToCatalog")}
        </Button>
      </div>

      <Tabs
        className="w-full flex-col items-start gap-6 sm:flex-row sm:items-start"
        defaultValue="general"
        orientation="vertical"
      >
        <TabsList
          className="w-full shrink-0 *:grow-0 sm:w-44"
          variant="underline"
        >
          <TabsTab value="general">
            <SettingsIcon />
            {t("tabs.general")}
          </TabsTab>
          <TabsTab value="access">
            <UsersIcon />
            {t("tabs.access")}
          </TabsTab>
          <TabsTab value="audit">
            <ScrollTextIcon />
            {t("tabs.audit")}
          </TabsTab>
        </TabsList>

        <div className="min-w-0 flex-1">
          <TabsPanel className="space-y-6" value="general">
            <RepositoryVisibilitySection
              repositoryId={repository.id}
              isPublic={repository.isPublic}
            />
            <RepositoryDangerZone
              repositoryId={repository.id}
              repositoryName={repository.name}
            />
          </TabsPanel>

          <TabsPanel className="space-y-6" value="access">
            <RepositoryMembersSection repositoryId={repository.id} />
            <RepositoryRolesMatrix />
          </TabsPanel>

          <TabsPanel value="audit">
            <RepositoryAuditSection repositoryId={repository.id} />
          </TabsPanel>
        </div>
      </Tabs>
    </div>
  );
}
