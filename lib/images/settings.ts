// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { and, eq, inArray } from "drizzle-orm";

import { writeAuditLog } from "@/lib/audit/log";
import { getDb } from "@/lib/db";
import { repositories, imageSettings } from "@/lib/db/schema";
import { getRepositoryMemberRole } from "@/lib/rbac/roles";
import { canPerformRepositoryAction } from "@/lib/rbac/check";
import type { SystemRole } from "@/lib/rbac/types";

import type { AnonymousPullOverride, ImageSettings } from "./types";

export function computeEffectiveAnonymousPull(
  repositoryIsPublic: boolean,
  override: AnonymousPullOverride,
): boolean {
  if (override === "allow") {
    return true;
  }

  if (override === "deny") {
    return false;
  }

  return repositoryIsPublic;
}

function toImageSettings(
  repositoryIsPublic: boolean,
  override: AnonymousPullOverride,
): ImageSettings {
  return {
    anonymousPull: override,
    effectiveAnonymousPull: computeEffectiveAnonymousPull(
      repositoryIsPublic,
      override,
    ),
    repositoryAnonymousPullDefault: repositoryIsPublic,
  };
}

async function requireImageSettingsAccess(
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

export async function getImageOverridesForRepository(
  repositoryId: string,
  imageNames: string[],
): Promise<Map<string, AnonymousPullOverride>> {
  const uniqueNames = [...new Set(imageNames.filter(Boolean))];
  const result = new Map<string, AnonymousPullOverride>();

  if (uniqueNames.length === 0) {
    return result;
  }

  const db = getDb();
  const rows = await db
    .select({
      name: imageSettings.name,
      anonymousPull: imageSettings.anonymousPull,
    })
    .from(imageSettings)
    .where(
      and(
        eq(imageSettings.repositoryId, repositoryId),
        inArray(imageSettings.name, uniqueNames),
      ),
    );

  for (const row of rows) {
    result.set(row.name, row.anonymousPull);
  }

  return result;
}

export async function getImageSettings(
  repositoryId: string,
  imageName: string,
  userId: string,
  systemRole: SystemRole,
): Promise<ImageSettings | { error: "not_found" | "forbidden" }> {
  const access = await requireImageSettingsAccess(
    repositoryId,
    userId,
    systemRole,
  );

  if ("error" in access) {
    return access;
  }

  const db = getDb();
  const [row] = await db
    .select({ anonymousPull: imageSettings.anonymousPull })
    .from(imageSettings)
    .where(
      and(
        eq(imageSettings.repositoryId, repositoryId),
        eq(imageSettings.name, imageName),
      ),
    )
    .limit(1);

  const override = row?.anonymousPull ?? "inherit";
  return toImageSettings(access.repository.isPublic, override);
}

export async function upsertImageSettings(
  actorId: string,
  repositoryId: string,
  imageName: string,
  anonymousPull: AnonymousPullOverride,
  userId: string,
  systemRole: SystemRole,
): Promise<
  ImageSettings | { error: "not_found" | "forbidden" | "invalid_input" }
> {
  const access = await requireImageSettingsAccess(
    repositoryId,
    userId,
    systemRole,
  );

  if ("error" in access) {
    return access;
  }

  const normalizedName = imageName.trim();
  if (!normalizedName) {
    return { error: "invalid_input" };
  }

  const db = getDb();

  if (anonymousPull === "inherit") {
    await db
      .delete(imageSettings)
      .where(
        and(
          eq(imageSettings.repositoryId, repositoryId),
          eq(imageSettings.name, normalizedName),
        ),
      );
  } else {
    await db
      .insert(imageSettings)
      .values({
        repositoryId,
        name: normalizedName,
        anonymousPull,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [imageSettings.repositoryId, imageSettings.name],
        set: {
          anonymousPull,
          updatedAt: new Date(),
        },
      });
  }

  await writeAuditLog({
    userId: actorId,
    action: "image.settings.update",
    resource: `repository:${access.repository.name}/image:${normalizedName}`,
  });

  return toImageSettings(access.repository.isPublic, anonymousPull);
}

export async function enrichImagesWithVisibility(
  repositoryId: string,
  repositoryIsPublic: boolean,
  images: { name: string; tagCount: number }[],
): Promise<
  {
    name: string;
    tagCount: number;
    anonymousPull: AnonymousPullOverride;
    effectiveAnonymousPull: boolean;
  }[]
> {
  const overrides = await getImageOverridesForRepository(
    repositoryId,
    images.map((image) => image.name),
  );

  return images.map((image) => {
    const anonymousPull = overrides.get(image.name) ?? "inherit";
    return {
      ...image,
      anonymousPull,
      effectiveAnonymousPull: computeEffectiveAnonymousPull(
        repositoryIsPublic,
        anonymousPull,
      ),
    };
  });
}
