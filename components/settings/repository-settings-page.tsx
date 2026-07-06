// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import Link from "next/link";
import { SettingsIcon } from "lucide-react";

import { RepositoryDangerZone } from "@/components/settings/repository-danger-zone";
import { RepositoryMembersSection } from "@/components/settings/repository-members-section";
import { RepositoryVisibilitySection } from "@/components/settings/repository-visibility-section";
import { useAuthUser } from "@/components/providers/auth-guard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useRepositoryByName } from "@/lib/hooks/use-repository";

type RepositorySettingsPageProps = {
  repositoryName: string;
};

export function RepositorySettingsPage({ repositoryName }: RepositorySettingsPageProps) {
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
        Repository not found or you do not have access.
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
          Only repository admins can manage settings for {repositoryName}.
        </div>
        <Button variant="outline" render={<Link href={`/r/${repositoryName}`} />}>
          Back to catalog
        </Button>
      </div>
    );
  }

  const repository = repositoryQuery.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Manage members, visibility, and deletion for {repository.name}.
          </p>
        </div>
        <Button variant="outline" render={<Link href={`/r/${repositoryName}`} />}>
          <SettingsIcon className="size-4" />
          Back to catalog
        </Button>
      </div>

      <RepositoryVisibilitySection
        repositoryId={repository.id}
        isPublic={repository.isPublic}
      />
      <RepositoryMembersSection repositoryId={repository.id} />
      <RepositoryDangerZone repositoryId={repository.id} repositoryName={repository.name} />
    </div>
  );
}
