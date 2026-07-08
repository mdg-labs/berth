// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import Link from "next/link";
import { SettingsIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { RepositoryAuditSection } from "@/components/settings/repository-audit-section";
import { RepositoryDangerZone } from "@/components/settings/repository-danger-zone";
import { RepositoryMembersSection } from "@/components/settings/repository-members-section";
import { RepositoryRolesMatrix } from "@/components/settings/repository-roles-matrix";
import { RepositoryVisibilitySection } from "@/components/settings/repository-visibility-section";
import { useAuthUser } from "@/components/providers/auth-guard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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

      <RepositoryVisibilitySection
        repositoryId={repository.id}
        isPublic={repository.isPublic}
      />
      <RepositoryMembersSection repositoryId={repository.id} />
      <RepositoryRolesMatrix />
      <RepositoryAuditSection repositoryId={repository.id} />
      <RepositoryDangerZone repositoryId={repository.id} repositoryName={repository.name} />
    </div>
  );
}
