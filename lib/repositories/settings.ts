// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { eq } from "drizzle-orm";

import { writeAuditLog } from "@/lib/audit/log";
import { getDb } from "@/lib/db";
import { repositories } from "@/lib/db/schema";
import { getRepositoryMemberRole } from "@/lib/rbac/roles";
import { canPerformRepositoryAction } from "@/lib/rbac/check";
import type { SystemRole } from "@/lib/rbac/types";

import type { RepositorySettings } from "./types";

export {
  computeEffectiveAnonymousPull,
  enrichImagesWithVisibility,
  getImageOverridesForRepository,
  getImageSettings,
  upsertImageSettings,
} from "@/lib/images/settings";

async function requireRepositorySettingsAccess(
  repositoryId: string,
  userId: string,
  systemRole: SystemRole,
): Promise<
  | { repository: { id: string; name: string; isPublic: boolean } }
  | { error: "not_found" | "forbidden" }
> {
  const db = getDb();
  const [repository] = await db
    .select({
      id: repositories.id,
      name: repositories.name,
      isPublic: repositories.isPublic,
    })
    .from(repositories)
    .where(eq(repositories.id, repositoryId))
    .limit(1);

  if (!repository) {
    return { error: "not_found" };
  }

  const memberRole = await getRepositoryMemberRole(userId, repositoryId);
  if (!canPerformRepositoryAction(systemRole, memberRole, "update_repository")) {
    return { error: "forbidden" };
  }

  return { repository };
}

export async function getRepositorySettings(
  repositoryId: string,
  userId: string,
  systemRole: SystemRole,
): Promise<RepositorySettings | { error: "not_found" | "forbidden" }> {
  const access = await requireRepositorySettingsAccess(
    repositoryId,
    userId,
    systemRole,
  );

  if ("error" in access) {
    return access;
  }

  return {
    anonymousPullDefault: access.repository.isPublic,
  };
}

export async function updateRepositorySettings(
  repositoryId: string,
  userId: string,
  systemRole: SystemRole,
  input: { anonymousPullDefault?: boolean },
): Promise<RepositorySettings | { error: "not_found" | "forbidden" }> {
  const access = await requireRepositorySettingsAccess(
    repositoryId,
    userId,
    systemRole,
  );

  if ("error" in access) {
    return access;
  }

  if (input.anonymousPullDefault === undefined) {
    return { anonymousPullDefault: access.repository.isPublic };
  }

  const db = getDb();
  await db
    .update(repositories)
    .set({ isPublic: input.anonymousPullDefault })
    .where(eq(repositories.id, repositoryId));

  await writeAuditLog({
    userId,
    action: "repository.settings.update",
    resource: `repository:${access.repository.name}`,
    repositoryId,
  });

  return {
    anonymousPullDefault: input.anonymousPullDefault,
  };
}
