// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { repositoryMembers, repositories } from "@/lib/db/schema";

import type { RepositoryRole, SystemRole } from "./types";

export type RepositoryContext = {
  id: string;
  name: string;
  isPublic: boolean;
};

export async function getRepositoryById(
  repositoryId: string,
): Promise<RepositoryContext | null> {
  const db = getDb();
  const [row] = await db
    .select({
      id: repositories.id,
      name: repositories.name,
      isPublic: repositories.isPublic,
    })
    .from(repositories)
    .where(eq(repositories.id, repositoryId))
    .limit(1);

  return row ?? null;
}

export async function getRepositoryByName(
  repositoryName: string,
): Promise<RepositoryContext | null> {
  const db = getDb();
  const [row] = await db
    .select({
      id: repositories.id,
      name: repositories.name,
      isPublic: repositories.isPublic,
    })
    .from(repositories)
    .where(eq(repositories.name, repositoryName))
    .limit(1);

  return row ?? null;
}

export async function getRepositoryMemberRole(
  userId: string,
  repositoryId: string,
): Promise<RepositoryRole | null> {
  const db = getDb();
  const [row] = await db
    .select({ role: repositoryMembers.role })
    .from(repositoryMembers)
    .where(
      and(
        eq(repositoryMembers.repositoryId, repositoryId),
        eq(repositoryMembers.userId, userId),
      ),
    )
    .limit(1);

  return row?.role ?? null;
}

export async function getEffectiveRepositoryRole(
  userId: string,
  systemRole: SystemRole,
  repository: RepositoryContext,
): Promise<RepositoryRole | "bypass" | null> {
  if (systemRole === "admin") {
    return "bypass";
  }

  const memberRole = await getRepositoryMemberRole(userId, repository.id);
  if (memberRole) {
    return memberRole;
  }

  if (repository.isPublic) {
    return "guest";
  }

  return null;
}
