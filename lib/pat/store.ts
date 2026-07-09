// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { and, desc, eq, inArray, isNull } from "drizzle-orm";

import { writeAuditLog } from "@/lib/audit/log";
import { getPatPolicy, PAT_LAST_USED_THROTTLE_MS, PAT_PREFIX } from "@/lib/pat/config";
import type {
  CreatePersonalAccessTokenInput,
  PatContext,
  PersonalAccessTokenSummary,
} from "@/lib/pat/types";
import {
  repositoryMeetsPatRequirements,
  validatePatCreateInput,
  type PatValidationError,
} from "@/lib/pat/validation";
import { listRepositoriesForUser } from "@/lib/repositories/service";
import { generateToken, hashToken, isTokenExpired } from "@/lib/email/tokens";
import { getDb } from "@/lib/db";
import {
  personalAccessTokenRepositories,
  personalAccessTokens,
  repositories,
  users,
} from "@/lib/db/schema";
import { getEffectiveRepositoryRole } from "@/lib/rbac/roles";
import type { RegistryAuthUser } from "@/lib/registry/client/auth";

export type CreatePatResult =
  | {
      ok: true;
      token: string;
      summary: PersonalAccessTokenSummary;
    }
  | { ok: false; error: PatValidationError };

export async function listPersonalAccessTokens(
  userId: string,
): Promise<PersonalAccessTokenSummary[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(personalAccessTokens)
    .where(eq(personalAccessTokens.userId, userId))
    .orderBy(desc(personalAccessTokens.createdAt));

  if (rows.length === 0) {
    return [];
  }

  const tokenIds = rows.map((row) => row.id);
  const repoRows = await db
    .select({
      tokenId: personalAccessTokenRepositories.tokenId,
      repositoryId: personalAccessTokenRepositories.repositoryId,
      repositoryName: repositories.name,
    })
    .from(personalAccessTokenRepositories)
    .innerJoin(
      repositories,
      eq(personalAccessTokenRepositories.repositoryId, repositories.id),
    )
    .where(inArray(personalAccessTokenRepositories.tokenId, tokenIds));

  const reposByToken = new Map<string, { ids: string[]; names: string[] }>();
  for (const row of repoRows) {
    const existing = reposByToken.get(row.tokenId) ?? { ids: [], names: [] };
    existing.ids.push(row.repositoryId);
    existing.names.push(row.repositoryName);
    reposByToken.set(row.tokenId, existing);
  }

  return rows.map((row) => {
    const repos = reposByToken.get(row.id) ?? { ids: [], names: [] };
    return {
      id: row.id,
      name: row.name,
      tokenPrefix: row.tokenPrefix,
      allowPull: row.allowPull,
      allowPush: row.allowPush,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      revokedAt: row.revokedAt?.toISOString() ?? null,
      lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      repositoryIds: repos.ids,
      repositoryNames: repos.names,
    };
  });
}

async function validateRepositorySelection(
  user: RegistryAuthUser,
  input: CreatePersonalAccessTokenInput,
): Promise<PatValidationError | null> {
  if (!input.repositoryIds || input.repositoryIds.length === 0) {
    return null;
  }

  const accessible = await listRepositoriesForUser(user);
  const accessibleById = new Map(accessible.map((repo) => [repo.id, repo]));

  for (const repositoryId of input.repositoryIds) {
    const repo = accessibleById.get(repositoryId);
    if (!repo) {
      return "invalid_repository";
    }

    const effectiveRole = await getEffectiveRepositoryRole(
      user.id,
      user.systemRole,
      {
        id: repo.id,
        name: repo.name,
        isPublic: repo.isPublic,
      },
    );

    if (
      effectiveRole === "bypass" ||
      (effectiveRole &&
        repositoryMeetsPatRequirements(
          effectiveRole,
          input.allowPull,
          input.allowPush,
        ))
    ) {
      continue;
    }

    return "insufficient_repository_access";
  }

  return null;
}

export async function createPersonalAccessToken(
  user: RegistryAuthUser,
  input: CreatePersonalAccessTokenInput,
  clientIp?: string | null,
): Promise<CreatePatResult> {
  const policy = await getPatPolicy();
  const validationError = validatePatCreateInput(input, policy);
  if (validationError) {
    return { ok: false, error: validationError };
  }

  const repoError = await validateRepositorySelection(user, input);
  if (repoError) {
    return { ok: false, error: repoError };
  }

  const rawSecret = generateToken();
  const fullToken = `${PAT_PREFIX}${rawSecret}`;
  const tokenPrefix = fullToken.slice(0, 12);
  const tokenHash = hashToken(fullToken);
  const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;

  const db = getDb();
  const [created] = await db
    .insert(personalAccessTokens)
    .values({
      userId: user.id,
      name: input.name.trim(),
      tokenPrefix,
      tokenHash,
      allowPull: input.allowPull,
      allowPush: input.allowPush,
      expiresAt,
    })
    .returning();

  if (!created) {
    throw new Error("Failed to create personal access token");
  }

  if (input.repositoryIds && input.repositoryIds.length > 0) {
    await db.insert(personalAccessTokenRepositories).values(
      input.repositoryIds.map((repositoryId) => ({
        tokenId: created.id,
        repositoryId,
      })),
    );
  }

  const summaries = await listPersonalAccessTokens(user.id);
  const summary = summaries.find((entry) => entry.id === created.id);
  if (!summary) {
    throw new Error("Failed to load created personal access token");
  }

  await writeAuditLog({
    userId: user.id,
    action: "auth.pat_created",
    resource: `pat:${created.id}`,
    metadata: {
      name: created.name,
      allowPull: created.allowPull,
      allowPush: created.allowPush,
      expiresAt: created.expiresAt?.toISOString() ?? null,
      repositoryIds: input.repositoryIds ?? [],
    },
    clientIp: clientIp ?? null,
  });

  return {
    ok: true,
    token: fullToken,
    summary,
  };
}

export async function revokePersonalAccessToken(
  userId: string,
  tokenId: string,
  clientIp?: string | null,
): Promise<boolean> {
  const db = getDb();
  const now = new Date();
  const [updated] = await db
    .update(personalAccessTokens)
    .set({ revokedAt: now })
    .where(
      and(
        eq(personalAccessTokens.id, tokenId),
        eq(personalAccessTokens.userId, userId),
        isNull(personalAccessTokens.revokedAt),
      ),
    )
    .returning({ id: personalAccessTokens.id, name: personalAccessTokens.name });

  if (!updated) {
    return false;
  }

  await writeAuditLog({
    userId,
    action: "auth.pat_revoked",
    resource: `pat:${updated.id}`,
    metadata: { name: updated.name },
    clientIp: clientIp ?? null,
  });

  return true;
}

export async function revokeAllPersonalAccessTokensForUser(
  userId: string,
): Promise<void> {
  const db = getDb();
  await db
    .update(personalAccessTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(personalAccessTokens.userId, userId),
        isNull(personalAccessTokens.revokedAt),
      ),
    );
}

export type ResolvedPat = {
  pat: PatContext;
  lastUsedAt: Date | null;
  user: {
    id: string;
    email: string;
    systemRole: "admin" | "user";
  };
};

export async function resolvePersonalAccessToken(
  token: string,
): Promise<ResolvedPat | null> {
  if (!token.startsWith(PAT_PREFIX)) {
    return null;
  }

  const db = getDb();
  const tokenHash = hashToken(token);
  const [row] = await db
    .select({
      id: personalAccessTokens.id,
      userId: personalAccessTokens.userId,
      allowPull: personalAccessTokens.allowPull,
      allowPush: personalAccessTokens.allowPush,
      expiresAt: personalAccessTokens.expiresAt,
      revokedAt: personalAccessTokens.revokedAt,
      lastUsedAt: personalAccessTokens.lastUsedAt,
      email: users.email,
      systemRole: users.systemRole,
      deletedAt: users.deletedAt,
    })
    .from(personalAccessTokens)
    .innerJoin(users, eq(personalAccessTokens.userId, users.id))
    .where(eq(personalAccessTokens.tokenHash, tokenHash))
    .limit(1);

  if (!row || row.revokedAt || row.deletedAt) {
    return null;
  }

  if (row.expiresAt && isTokenExpired(row.expiresAt)) {
    return null;
  }

  const repoRows = await db
    .select({ repositoryId: personalAccessTokenRepositories.repositoryId })
    .from(personalAccessTokenRepositories)
    .where(eq(personalAccessTokenRepositories.tokenId, row.id));

  return {
    pat: {
      id: row.id,
      userId: row.userId,
      allowPull: row.allowPull,
      allowPush: row.allowPush,
      repositoryIds: repoRows.map((entry) => entry.repositoryId),
    },
    lastUsedAt: row.lastUsedAt,
    user: {
      id: row.userId,
      email: row.email,
      systemRole: row.systemRole,
    },
  };
}

export async function touchPersonalAccessTokenLastUsed(
  tokenId: string,
  lastUsedAt: Date | null,
): Promise<void> {
  const now = new Date();
  if (
    lastUsedAt &&
    now.getTime() - lastUsedAt.getTime() < PAT_LAST_USED_THROTTLE_MS
  ) {
    return;
  }

  const db = getDb();
  await db
    .update(personalAccessTokens)
    .set({ lastUsedAt: now })
    .where(eq(personalAccessTokens.id, tokenId));
}

export async function recordPatUsageAudit(
  userId: string,
  patId: string,
  clientIp?: string | null,
): Promise<void> {
  await writeAuditLog({
    userId,
    action: "auth.pat_used",
    resource: `pat:${patId}`,
    clientIp: clientIp ?? null,
  });
}

export async function buildRepositoryNameToIdMap(
  repositoryNames: string[],
): Promise<Map<string, string>> {
  if (repositoryNames.length === 0) {
    return new Map();
  }

  const db = getDb();
  const rows = await db
    .select({ id: repositories.id, name: repositories.name })
    .from(repositories)
    .where(inArray(repositories.name, repositoryNames));

  return new Map(rows.map((row) => [row.name, row.id]));
}
