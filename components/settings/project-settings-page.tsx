// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import Link from "next/link";
import { SettingsIcon } from "lucide-react";

import { ProjectDangerZone } from "@/components/settings/project-danger-zone";
import { ProjectMembersSection } from "@/components/settings/project-members-section";
import { ProjectVisibilitySection } from "@/components/settings/project-visibility-section";
import { useAuthUser } from "@/components/providers/auth-guard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useProjectByName } from "@/lib/hooks/use-project";

type ProjectSettingsPageProps = {
  projectName: string;
};

export function ProjectSettingsPage({ projectName }: ProjectSettingsPageProps) {
  const { data: authData } = useAuthUser();
  const projectQuery = useProjectByName(projectName);

  const canManage =
    authData?.user.systemRole === "admin" || projectQuery.data?.role === "admin";

  if (projectQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    );
  }

  if (projectQuery.isError || !projectQuery.data) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
        Project not found or you do not have access.
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
          Only project admins can manage settings for {projectName}.
        </div>
        <Button variant="outline" render={<Link href={`/p/${projectName}`} />}>
          Back to catalog
        </Button>
      </div>
    );
  }

  const project = projectQuery.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Manage members, visibility, and deletion for {project.name}.
          </p>
        </div>
        <Button variant="outline" render={<Link href={`/p/${projectName}`} />}>
          <SettingsIcon className="size-4" />
          Back to catalog
        </Button>
      </div>

      <ProjectVisibilitySection
        projectId={project.id}
        isPublic={project.isPublic}
      />
      <ProjectMembersSection projectId={project.id} />
      <ProjectDangerZone projectId={project.id} projectName={project.name} />
    </div>
  );
}
