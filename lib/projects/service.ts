// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { eq } from "drizzle-orm";

import { writeAuditLog } from "@/lib/audit/log";
import { getDb } from "@/lib/db";
import { projectMembers, projects } from "@/lib/db/schema";
import { canPerformProjectAction, isSystemAdmin } from "@/lib/rbac/check";
import { getProjectMemberRole } from "@/lib/rbac/roles";
import type { SystemRole } from "@/lib/rbac/types";

import {
  countNonEmptyReposForProjects,
  deleteAllReposInProject,
  listNonEmptyReposInProject,
} from "./registry";
import { isValidProjectName, normalizeProjectName } from "./validation";

export type ProjectSummary = {
  id: string;
  name: string;
  isPublic: boolean;
  createdAt: string;
  role: "guest" | "developer" | "maintainer" | "admin" | null;
  repositoryCount: number;
};

export type ProjectDetail = ProjectSummary & {
  createdBy: string | null;
};

export async function listProjectsForUser(
  userId: string,
  systemRole: SystemRole,
): Promise<ProjectSummary[]> {
  const db = getDb();

  if (isSystemAdmin(systemRole)) {
    const rows = await db
      .select({
        id: projects.id,
        name: projects.name,
        isPublic: projects.isPublic,
        createdAt: projects.createdAt,
      })
      .from(projects);

    const summaries = rows.map((row) => ({
      id: row.id,
      name: row.name,
      isPublic: row.isPublic,
      createdAt: row.createdAt.toISOString(),
      role: null,
    }));

    const repositoryCounts = await countNonEmptyReposForProjects(
      summaries.map((summary) => summary.name),
    );

    return summaries.map((summary) => ({
      ...summary,
      repositoryCount: repositoryCounts.get(summary.name) ?? 0,
    }));
  }

  const memberRows = await db
    .select({
      id: projects.id,
      name: projects.name,
      isPublic: projects.isPublic,
      createdAt: projects.createdAt,
      role: projectMembers.role,
    })
    .from(projectMembers)
    .innerJoin(projects, eq(projectMembers.projectId, projects.id))
    .where(eq(projectMembers.userId, userId));

  const memberProjectIds = new Set(memberRows.map((row) => row.id));

  const publicRows = await db
    .select({
      id: projects.id,
      name: projects.name,
      isPublic: projects.isPublic,
      createdAt: projects.createdAt,
    })
    .from(projects)
    .where(eq(projects.isPublic, true));

  const summaries: Omit<ProjectSummary, "repositoryCount">[] = memberRows.map(
    (row) => ({
      id: row.id,
      name: row.name,
      isPublic: row.isPublic,
      createdAt: row.createdAt.toISOString(),
      role: row.role,
    }),
  );

  for (const row of publicRows) {
    if (!memberProjectIds.has(row.id)) {
      summaries.push({
        id: row.id,
        name: row.name,
        isPublic: row.isPublic,
        createdAt: row.createdAt.toISOString(),
        role: null,
      });
    }
  }

  summaries.sort((a, b) => a.name.localeCompare(b.name));

  const repositoryCounts = await countNonEmptyReposForProjects(
    summaries.map((summary) => summary.name),
  );

  return summaries.map((summary) => ({
    ...summary,
    repositoryCount: repositoryCounts.get(summary.name) ?? 0,
  }));
}

export async function getProjectDetail(
  projectId: string,
  userId: string,
  systemRole: SystemRole,
): Promise<ProjectDetail | null> {
  const db = getDb();
  const [row] = await db
    .select({
      id: projects.id,
      name: projects.name,
      isPublic: projects.isPublic,
      createdBy: projects.createdBy,
      createdAt: projects.createdAt,
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!row) {
    return null;
  }

  const memberRole = await getProjectMemberRole(userId, projectId);
  const canView =
    isSystemAdmin(systemRole) ||
    memberRole !== null ||
    row.isPublic;

  if (!canView) {
    return null;
  }

  const repositoryCounts = await countNonEmptyReposForProjects([row.name]);

  return {
    id: row.id,
    name: row.name,
    isPublic: row.isPublic,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    role: memberRole,
    repositoryCount: repositoryCounts.get(row.name) ?? 0,
  };
}

export async function createProject(
  userId: string,
  input: { name: string; isPublic?: boolean },
): Promise<ProjectDetail | { error: "invalid_name" | "name_taken" }> {
  const name = normalizeProjectName(input.name);

  if (!isValidProjectName(name)) {
    return { error: "invalid_name" };
  }

  const db = getDb();
  const [existing] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.name, name))
    .limit(1);

  if (existing) {
    return { error: "name_taken" };
  }

  const [created] = await db
    .insert(projects)
    .values({
      name,
      isPublic: input.isPublic ?? false,
      createdBy: userId,
    })
    .returning({
      id: projects.id,
      name: projects.name,
      isPublic: projects.isPublic,
      createdBy: projects.createdBy,
      createdAt: projects.createdAt,
    });

  if (!created) {
    throw new Error("Failed to create project");
  }

  await db.insert(projectMembers).values({
    projectId: created.id,
    userId,
    role: "admin",
  });

  return {
    id: created.id,
    name: created.name,
    isPublic: created.isPublic,
    createdBy: created.createdBy,
    createdAt: created.createdAt.toISOString(),
    role: "admin",
    repositoryCount: 0,
  };
}

export async function updateProject(
  projectId: string,
  userId: string,
  systemRole: SystemRole,
  input: { name?: string; isPublic?: boolean },
): Promise<
  ProjectDetail | { error: "not_found" | "forbidden" | "invalid_name" | "name_taken" }
> {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!existing) {
    return { error: "not_found" };
  }

  const memberRole = await getProjectMemberRole(userId, projectId);
  if (
    !canPerformProjectAction(systemRole, memberRole, "update_project")
  ) {
    return { error: "forbidden" };
  }

  const updates: Partial<typeof projects.$inferInsert> = {};

  if (input.name !== undefined) {
    const name = normalizeProjectName(input.name);
    if (!isValidProjectName(name)) {
      return { error: "invalid_name" };
    }

    if (name !== existing.name) {
      const [taken] = await db
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.name, name))
        .limit(1);

      if (taken) {
        return { error: "name_taken" };
      }
    }

    updates.name = name;
  }

  if (input.isPublic !== undefined) {
    updates.isPublic = input.isPublic;
  }

  if (Object.keys(updates).length === 0) {
    const repositoryCounts = await countNonEmptyReposForProjects([existing.name]);

    return {
      id: existing.id,
      name: existing.name,
      isPublic: existing.isPublic,
      createdBy: existing.createdBy,
      createdAt: existing.createdAt.toISOString(),
      role: memberRole,
      repositoryCount: repositoryCounts.get(existing.name) ?? 0,
    };
  }

  const [updated] = await db
    .update(projects)
    .set(updates)
    .where(eq(projects.id, projectId))
    .returning({
      id: projects.id,
      name: projects.name,
      isPublic: projects.isPublic,
      createdBy: projects.createdBy,
      createdAt: projects.createdAt,
    });

  if (!updated) {
    return { error: "not_found" };
  }

  const repositoryCounts = await countNonEmptyReposForProjects([updated.name]);

  return {
    id: updated.id,
    name: updated.name,
    isPublic: updated.isPublic,
    createdBy: updated.createdBy,
    createdAt: updated.createdAt.toISOString(),
    role: memberRole,
    repositoryCount: repositoryCounts.get(updated.name) ?? 0,
  };
}

export async function deleteProject(
  projectId: string,
  userId: string,
  systemRole: SystemRole,
  options: { force?: boolean },
): Promise<
  | { ok: true }
  | {
      error: "not_found" | "forbidden" | "has_repos";
      repos?: string[];
    }
> {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!existing) {
    return { error: "not_found" };
  }

  const memberRole = await getProjectMemberRole(userId, projectId);
  if (
    !canPerformProjectAction(systemRole, memberRole, "delete_project")
  ) {
    return { error: "forbidden" };
  }

  const repos = await listNonEmptyReposInProject(existing.name);
  if (repos.length > 0 && !options.force) {
    return { error: "has_repos", repos };
  }

  if (options.force && repos.length > 0) {
    await deleteAllReposInProject(existing.name);
    await writeAuditLog({
      userId,
      action: "project.force_delete",
      resource: `project:${existing.name}`,
    });
  } else {
    await writeAuditLog({
      userId,
      action: "project.delete",
      resource: `project:${existing.name}`,
    });
  }

  await db.delete(projects).where(eq(projects.id, projectId));

  return { ok: true };
}
