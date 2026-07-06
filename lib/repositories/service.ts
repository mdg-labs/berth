// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { eq } from "drizzle-orm";

import { writeAuditLog } from "@/lib/audit/log";
import { getDb } from "@/lib/db";
import { repositoryMembers, repositories } from "@/lib/db/schema";
import { canPerformRepositoryAction, isSystemAdmin } from "@/lib/rbac/check";
import { getRepositoryMemberRole } from "@/lib/rbac/roles";
import type { RegistryAuthUser } from "@/lib/registry/client/auth";

import {
  countNonEmptyImagesForRepositories,
  deleteAllImagesInRepository,
  listNonEmptyImagesInRepository,
} from "./registry";
import { isValidRepositoryName, normalizeRepositoryName } from "./validation";

export type RepositorySummary = {
  id: string;
  name: string;
  isPublic: boolean;
  createdAt: string;
  role: "guest" | "developer" | "maintainer" | "admin" | null;
  imageCount: number;
};

export type RepositoryDetail = RepositorySummary & {
  createdBy: string | null;
};

export async function listRepositoriesForUser(
  user: RegistryAuthUser,
): Promise<RepositorySummary[]> {
  const db = getDb();
  const { id: userId, systemRole } = user;

  if (isSystemAdmin(systemRole)) {
    const rows = await db
      .select({
        id: repositories.id,
        name: repositories.name,
        isPublic: repositories.isPublic,
        createdAt: repositories.createdAt,
      })
      .from(repositories);

    const summaries = rows.map((row) => ({
      id: row.id,
      name: row.name,
      isPublic: row.isPublic,
      createdAt: row.createdAt.toISOString(),
      role: null,
    }));

    const imageCounts = await countNonEmptyImagesForRepositories(
      user,
      summaries.map((summary) => summary.name),
    );

    return summaries.map((summary) => ({
      ...summary,
      imageCount: imageCounts.get(summary.name) ?? 0,
    }));
  }

  const memberRows = await db
    .select({
      id: repositories.id,
      name: repositories.name,
      isPublic: repositories.isPublic,
      createdAt: repositories.createdAt,
      role: repositoryMembers.role,
    })
    .from(repositoryMembers)
    .innerJoin(repositories, eq(repositoryMembers.repositoryId, repositories.id))
    .where(eq(repositoryMembers.userId, userId));

  const memberRepositoryIds = new Set(memberRows.map((row) => row.id));

  const publicRows = await db
    .select({
      id: repositories.id,
      name: repositories.name,
      isPublic: repositories.isPublic,
      createdAt: repositories.createdAt,
    })
    .from(repositories)
    .where(eq(repositories.isPublic, true));

  const summaries: Omit<RepositorySummary, "imageCount">[] = memberRows.map(
    (row) => ({
      id: row.id,
      name: row.name,
      isPublic: row.isPublic,
      createdAt: row.createdAt.toISOString(),
      role: row.role,
    }),
  );

  for (const row of publicRows) {
    if (!memberRepositoryIds.has(row.id)) {
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

  const imageCounts = await countNonEmptyImagesForRepositories(
    user,
    summaries.map((summary) => summary.name),
  );

  return summaries.map((summary) => ({
    ...summary,
    imageCount: imageCounts.get(summary.name) ?? 0,
  }));
}

export async function getRepositoryDetail(
  repositoryId: string,
  user: RegistryAuthUser,
): Promise<RepositoryDetail | null> {
  const db = getDb();
  const { id: userId, systemRole } = user;
  const [row] = await db
    .select({
      id: repositories.id,
      name: repositories.name,
      isPublic: repositories.isPublic,
      createdBy: repositories.createdBy,
      createdAt: repositories.createdAt,
    })
    .from(repositories)
    .where(eq(repositories.id, repositoryId))
    .limit(1);

  if (!row) {
    return null;
  }

  const memberRole = await getRepositoryMemberRole(userId, repositoryId);
  const canView =
    isSystemAdmin(systemRole) ||
    memberRole !== null ||
    row.isPublic;

  if (!canView) {
    return null;
  }

  const imageCounts = await countNonEmptyImagesForRepositories(user, [row.name]);

  return {
    id: row.id,
    name: row.name,
    isPublic: row.isPublic,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    role: memberRole,
    imageCount: imageCounts.get(row.name) ?? 0,
  };
}

export async function createRepository(
  userId: string,
  input: { name: string; isPublic?: boolean },
): Promise<RepositoryDetail | { error: "invalid_name" | "name_taken" }> {
  const name = normalizeRepositoryName(input.name);

  if (!isValidRepositoryName(name)) {
    return { error: "invalid_name" };
  }

  const db = getDb();
  const [existing] = await db
    .select({ id: repositories.id })
    .from(repositories)
    .where(eq(repositories.name, name))
    .limit(1);

  if (existing) {
    return { error: "name_taken" };
  }

  const [created] = await db
    .insert(repositories)
    .values({
      name,
      isPublic: input.isPublic ?? false,
      createdBy: userId,
    })
    .returning({
      id: repositories.id,
      name: repositories.name,
      isPublic: repositories.isPublic,
      createdBy: repositories.createdBy,
      createdAt: repositories.createdAt,
    });

  if (!created) {
    throw new Error("Failed to create repository");
  }

  await db.insert(repositoryMembers).values({
    repositoryId: created.id,
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
    imageCount: 0,
  };
}

export async function updateRepository(
  repositoryId: string,
  user: RegistryAuthUser,
  input: { name?: string; isPublic?: boolean },
): Promise<
  RepositoryDetail | { error: "not_found" | "forbidden" | "invalid_name" | "name_taken" }
> {
  const db = getDb();
  const { id: userId, systemRole } = user;
  const [existing] = await db
    .select()
    .from(repositories)
    .where(eq(repositories.id, repositoryId))
    .limit(1);

  if (!existing) {
    return { error: "not_found" };
  }

  const memberRole = await getRepositoryMemberRole(userId, repositoryId);
  if (
    !canPerformRepositoryAction(systemRole, memberRole, "update_repository")
  ) {
    return { error: "forbidden" };
  }

  const updates: Partial<typeof repositories.$inferInsert> = {};

  if (input.name !== undefined) {
    const name = normalizeRepositoryName(input.name);
    if (!isValidRepositoryName(name)) {
      return { error: "invalid_name" };
    }

    if (name !== existing.name) {
      const [taken] = await db
        .select({ id: repositories.id })
        .from(repositories)
        .where(eq(repositories.name, name))
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
    const imageCounts = await countNonEmptyImagesForRepositories(user, [existing.name]);

    return {
      id: existing.id,
      name: existing.name,
      isPublic: existing.isPublic,
      createdBy: existing.createdBy,
      createdAt: existing.createdAt.toISOString(),
      role: memberRole,
      imageCount: imageCounts.get(existing.name) ?? 0,
    };
  }

  const [updated] = await db
    .update(repositories)
    .set(updates)
    .where(eq(repositories.id, repositoryId))
    .returning({
      id: repositories.id,
      name: repositories.name,
      isPublic: repositories.isPublic,
      createdBy: repositories.createdBy,
      createdAt: repositories.createdAt,
    });

  if (!updated) {
    return { error: "not_found" };
  }

  const imageCounts = await countNonEmptyImagesForRepositories(user, [updated.name]);

  return {
    id: updated.id,
    name: updated.name,
    isPublic: updated.isPublic,
    createdBy: updated.createdBy,
    createdAt: updated.createdAt.toISOString(),
    role: memberRole,
    imageCount: imageCounts.get(updated.name) ?? 0,
  };
}

export async function deleteRepository(
  repositoryId: string,
  user: RegistryAuthUser,
  options: { force?: boolean },
): Promise<
  | { ok: true }
  | {
      error: "not_found" | "forbidden" | "has_images";
      images?: string[];
    }
> {
  const db = getDb();
  const { id: userId, systemRole } = user;
  const [existing] = await db
    .select()
    .from(repositories)
    .where(eq(repositories.id, repositoryId))
    .limit(1);

  if (!existing) {
    return { error: "not_found" };
  }

  const memberRole = await getRepositoryMemberRole(userId, repositoryId);
  if (
    !canPerformRepositoryAction(systemRole, memberRole, "delete_repository")
  ) {
    return { error: "forbidden" };
  }

  const images = await listNonEmptyImagesInRepository(user, existing.name);
  if (images.length > 0 && !options.force) {
    return { error: "has_images", images };
  }

  if (options.force && images.length > 0) {
    await deleteAllImagesInRepository(user, existing.name);
    await writeAuditLog({
      userId,
      action: "repository.force_delete",
      resource: `repository:${existing.name}`,
    });
  } else {
    await writeAuditLog({
      userId,
      action: "repository.delete",
      resource: `repository:${existing.name}`,
    });
  }

  await db.delete(repositories).where(eq(repositories.id, repositoryId));

  return { ok: true };
}
