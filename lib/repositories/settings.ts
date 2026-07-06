// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { and, eq, inArray } from "drizzle-orm";

import { writeAuditLog } from "@/lib/audit/log";
import { getDb } from "@/lib/db";
import { projects, repositorySettings } from "@/lib/db/schema";
import { getProjectMemberRole } from "@/lib/rbac/roles";
import { canPerformProjectAction } from "@/lib/rbac/check";
import type { SystemRole } from "@/lib/rbac/types";
import type {
  AnonymousPullOverride,
  ProjectSettings,
  RepositorySettings,
} from "@/lib/repositories/types";

export function computeEffectiveAnonymousPull(
  projectIsPublic: boolean,
  override: AnonymousPullOverride,
): boolean {
  if (override === "allow") {
    return true;
  }

  if (override === "deny") {
    return false;
  }

  return projectIsPublic;
}

function toRepositorySettings(
  projectIsPublic: boolean,
  override: AnonymousPullOverride,
): RepositorySettings {
  return {
    anonymousPull: override,
    effectiveAnonymousPull: computeEffectiveAnonymousPull(
      projectIsPublic,
      override,
    ),
    projectAnonymousPullDefault: projectIsPublic,
  };
}

async function requireProjectSettingsAccess(
  projectId: string,
  userId: string,
  systemRole: SystemRole,
): Promise<
  | { project: { id: string; name: string; isPublic: boolean } }
  | { error: "not_found" | "forbidden" }
> {
  const db = getDb();
  const [project] = await db
    .select({
      id: projects.id,
      name: projects.name,
      isPublic: projects.isPublic,
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!project) {
    return { error: "not_found" };
  }

  const memberRole = await getProjectMemberRole(userId, projectId);
  if (!canPerformProjectAction(systemRole, memberRole, "update_project")) {
    return { error: "forbidden" };
  }

  return { project };
}

export async function getProjectSettings(
  projectId: string,
  userId: string,
  systemRole: SystemRole,
): Promise<ProjectSettings | { error: "not_found" | "forbidden" }> {
  const access = await requireProjectSettingsAccess(
    projectId,
    userId,
    systemRole,
  );

  if ("error" in access) {
    return access;
  }

  return {
    anonymousPullDefault: access.project.isPublic,
  };
}

export async function updateProjectSettings(
  projectId: string,
  userId: string,
  systemRole: SystemRole,
  input: { anonymousPullDefault?: boolean },
): Promise<ProjectSettings | { error: "not_found" | "forbidden" }> {
  const access = await requireProjectSettingsAccess(
    projectId,
    userId,
    systemRole,
  );

  if ("error" in access) {
    return access;
  }

  if (input.anonymousPullDefault === undefined) {
    return { anonymousPullDefault: access.project.isPublic };
  }

  const db = getDb();
  await db
    .update(projects)
    .set({ isPublic: input.anonymousPullDefault })
    .where(eq(projects.id, projectId));

  await writeAuditLog({
    userId,
    action: "project.settings.update",
    resource: `project:${access.project.name}`,
  });

  return {
    anonymousPullDefault: input.anonymousPullDefault,
  };
}

export async function getRepositoryOverridesForProject(
  projectId: string,
  repoNames: string[],
): Promise<Map<string, AnonymousPullOverride>> {
  const uniqueNames = [...new Set(repoNames.filter(Boolean))];
  const result = new Map<string, AnonymousPullOverride>();

  if (uniqueNames.length === 0) {
    return result;
  }

  const db = getDb();
  const rows = await db
    .select({
      name: repositorySettings.name,
      anonymousPull: repositorySettings.anonymousPull,
    })
    .from(repositorySettings)
    .where(
      and(
        eq(repositorySettings.projectId, projectId),
        inArray(repositorySettings.name, uniqueNames),
      ),
    );

  for (const row of rows) {
    result.set(row.name, row.anonymousPull);
  }

  return result;
}

export async function getRepositorySettings(
  projectId: string,
  repoName: string,
  userId: string,
  systemRole: SystemRole,
): Promise<RepositorySettings | { error: "not_found" | "forbidden" }> {
  const access = await requireProjectSettingsAccess(
    projectId,
    userId,
    systemRole,
  );

  if ("error" in access) {
    return access;
  }

  const db = getDb();
  const [row] = await db
    .select({ anonymousPull: repositorySettings.anonymousPull })
    .from(repositorySettings)
    .where(
      and(
        eq(repositorySettings.projectId, projectId),
        eq(repositorySettings.name, repoName),
      ),
    )
    .limit(1);

  const override = row?.anonymousPull ?? "inherit";
  return toRepositorySettings(access.project.isPublic, override);
}

export async function upsertRepositorySettings(
  actorId: string,
  projectId: string,
  repoName: string,
  anonymousPull: AnonymousPullOverride,
  userId: string,
  systemRole: SystemRole,
): Promise<
  RepositorySettings | { error: "not_found" | "forbidden" | "invalid_input" }
> {
  const access = await requireProjectSettingsAccess(
    projectId,
    userId,
    systemRole,
  );

  if ("error" in access) {
    return access;
  }

  const normalizedName = repoName.trim();
  if (!normalizedName) {
    return { error: "invalid_input" };
  }

  const db = getDb();

  if (anonymousPull === "inherit") {
    await db
      .delete(repositorySettings)
      .where(
        and(
          eq(repositorySettings.projectId, projectId),
          eq(repositorySettings.name, normalizedName),
        ),
      );
  } else {
    await db
      .insert(repositorySettings)
      .values({
        projectId,
        name: normalizedName,
        anonymousPull,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [repositorySettings.projectId, repositorySettings.name],
        set: {
          anonymousPull,
          updatedAt: new Date(),
        },
      });
  }

  await writeAuditLog({
    userId: actorId,
    action: "repository.settings.update",
    resource: `project:${access.project.name}/repository:${normalizedName}`,
  });

  return toRepositorySettings(access.project.isPublic, anonymousPull);
}

export async function enrichRepositoriesWithVisibility(
  projectId: string,
  projectIsPublic: boolean,
  repositories: { name: string; tagCount: number }[],
): Promise<
  {
    name: string;
    tagCount: number;
    anonymousPull: AnonymousPullOverride;
    effectiveAnonymousPull: boolean;
  }[]
> {
  const overrides = await getRepositoryOverridesForProject(
    projectId,
    repositories.map((repo) => repo.name),
  );

  return repositories.map((repo) => {
    const anonymousPull = overrides.get(repo.name) ?? "inherit";
    return {
      ...repo,
      anonymousPull,
      effectiveAnonymousPull: computeEffectiveAnonymousPull(
        projectIsPublic,
        anonymousPull,
      ),
    };
  });
}
