// Copyright (c) 2026 Michael David Guggenbichler (MDG Labs), licensed under Apache-2.0 — see LICENSE

import { and, asc, eq, isNull, lt, or } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { auditLog, machineAccounts, repositories, users } from "@/lib/db/schema";
import { generateToken, hashToken, isTokenExpired } from "@/lib/email/tokens";
import {
  MACHINE_ACCOUNT_PREFIX,
  MACHINE_ACCOUNT_TOKEN_PREFIX_LENGTH,
} from "@/lib/machine-accounts/config";
import type {
  CreateMachineAccountInput,
  MachineAccountSnapshot,
  MachineAccountSummary,
  ResolvedMachineAccount,
} from "@/lib/machine-accounts/types";
import { isUuid } from "@/lib/machine-accounts/validation";
import { PAT_LAST_USED_THROTTLE_MS } from "@/lib/pat/config";

const OWNER_NAME_CONSTRAINT = "machine_accounts_owner_repository_name_idx";

type MachineAccountActor = { id: string; name: string };

export type CreateMachineAccountResult =
  | { ok: true; secret: string; summary: MachineAccountSummary }
  | { ok: false; error: "duplicate_name" | "repository_not_found" };

export function machineAccountUsername(
  repositoryName: string,
  accountName: string,
): string {
  return `${repositoryName}+${accountName}`;
}

function pgErrorCode(error: unknown): { code?: string; constraint?: string } {
  const candidates = [error, (error as { cause?: unknown } | null)?.cause];
  for (const candidate of candidates) {
    if (candidate && typeof candidate === "object" && "code" in candidate) {
      const { code, constraint_name: constraint } = candidate as {
        code?: unknown;
        constraint_name?: unknown;
      };
      return {
        code: typeof code === "string" ? code : undefined,
        constraint: typeof constraint === "string" ? constraint : undefined,
      };
    }
  }
  return {};
}

export async function resolveMachineAccount(
  secret: string,
): Promise<ResolvedMachineAccount | null> {
  if (!secret.startsWith(MACHINE_ACCOUNT_PREFIX)) {
    return null;
  }

  const db = getDb();
  const [row] = await db
    .select({
      id: machineAccounts.id,
      name: machineAccounts.name,
      ownerRepositoryId: machineAccounts.ownerRepositoryId,
      allowPull: machineAccounts.allowPull,
      allowPush: machineAccounts.allowPush,
      expiresAt: machineAccounts.expiresAt,
      disabledAt: machineAccounts.disabledAt,
      lastUsedAt: machineAccounts.lastUsedAt,
    })
    .from(machineAccounts)
    .where(eq(machineAccounts.tokenHash, hashToken(secret)))
    .limit(1);

  if (!row || row.disabledAt) {
    return null;
  }

  if (row.expiresAt && isTokenExpired(row.expiresAt)) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    ownerRepositoryId: row.ownerRepositoryId,
    allowPull: row.allowPull,
    allowPush: row.allowPush,
    repositoryIds: row.ownerRepositoryId ? [row.ownerRepositoryId] : [],
    lastUsedAt: row.lastUsedAt,
  };
}

export async function getMachineAccountSnapshot(
  accountId: string,
): Promise<MachineAccountSnapshot | null> {
  if (!isUuid(accountId)) {
    return null;
  }

  const [row] = await getDb()
    .select({
      id: machineAccounts.id,
      name: machineAccounts.name,
      ownerRepositoryId: machineAccounts.ownerRepositoryId,
    })
    .from(machineAccounts)
    .where(eq(machineAccounts.id, accountId))
    .limit(1);

  return row
    ? {
        id: row.id,
        name: row.name,
        kind: row.ownerRepositoryId ? "repository" : "host",
      }
    : null;
}

export async function recordMachineAccountUsage(
  account: Pick<ResolvedMachineAccount, "id" | "name" | "ownerRepositoryId" | "lastUsedAt">,
  repositoryNames: string[],
  clientIp?: string | null,
): Promise<void> {
  const threshold = new Date(Date.now() - PAT_LAST_USED_THROTTLE_MS);
  if (account.lastUsedAt && account.lastUsedAt > threshold) {
    return;
  }

  await getDb().transaction(async (tx) => {
    const [touched] = await tx
      .update(machineAccounts)
      .set({ lastUsedAt: new Date() })
      .where(
        and(
          eq(machineAccounts.id, account.id),
          or(
            isNull(machineAccounts.lastUsedAt),
            lt(machineAccounts.lastUsedAt, threshold),
          ),
        ),
      )
      .returning({ id: machineAccounts.id });

    if (!touched) {
      return;
    }

    await tx.insert(auditLog).values({
      userId: null,
      machineAccountId: account.id,
      repositoryId: account.ownerRepositoryId,
      action: "machine_account.used",
      resource: `machine_account:${account.id}`,
      metadata: {
        machineAccount: {
          id: account.id,
          name: account.name,
          kind: account.ownerRepositoryId ? "repository" : "host",
        },
        repositories: repositoryNames,
      },
      clientIp: clientIp ?? null,
    });
  });
}

export async function listMachineAccounts(
  repositoryId: string,
): Promise<MachineAccountSummary[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: machineAccounts.id,
      name: machineAccounts.name,
      description: machineAccounts.description,
      tokenPrefix: machineAccounts.tokenPrefix,
      allowPull: machineAccounts.allowPull,
      allowPush: machineAccounts.allowPush,
      createdAt: machineAccounts.createdAt,
      createdById: users.id,
      createdByName: users.name,
      repositoryName: repositories.name,
    })
    .from(machineAccounts)
    .innerJoin(
      repositories,
      eq(machineAccounts.ownerRepositoryId, repositories.id),
    )
    .leftJoin(users, eq(machineAccounts.createdBy, users.id))
    .where(eq(machineAccounts.ownerRepositoryId, repositoryId))
    .orderBy(asc(machineAccounts.name));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    username: machineAccountUsername(row.repositoryName, row.name),
    tokenPrefix: row.tokenPrefix,
    allowPull: row.allowPull,
    allowPush: row.allowPush,
    createdBy:
      row.createdById && row.createdByName !== null
        ? { id: row.createdById, name: row.createdByName }
        : null,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function createMachineAccount(
  actor: MachineAccountActor,
  repository: { id: string; name: string },
  input: CreateMachineAccountInput,
  clientIp?: string | null,
): Promise<CreateMachineAccountResult> {
  const secret = `${MACHINE_ACCOUNT_PREFIX}${generateToken()}`;
  const db = getDb();

  try {
    const created = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(machineAccounts)
        .values({
          ownerRepositoryId: repository.id,
          name: input.name,
          description: input.description,
          tokenPrefix: secret.slice(0, MACHINE_ACCOUNT_TOKEN_PREFIX_LENGTH),
          tokenHash: hashToken(secret),
          allowPull: input.allowPull,
          allowPush: input.allowPush,
          createdBy: actor.id,
        })
        .returning();

      if (!row) {
        throw new Error("Failed to create machine account");
      }

      await tx.insert(auditLog).values({
        userId: actor.id,
        repositoryId: repository.id,
        action: "machine_account.create",
        resource: `machine_account:${row.id}`,
        metadata: {
          name: row.name,
          allowPull: row.allowPull,
          allowPush: row.allowPush,
        },
        clientIp: clientIp ?? null,
      });

      return row;
    });

    return {
      ok: true,
      secret,
      summary: {
        id: created.id,
        name: created.name,
        description: created.description,
        username: machineAccountUsername(repository.name, created.name),
        tokenPrefix: created.tokenPrefix,
        allowPull: created.allowPull,
        allowPush: created.allowPush,
        createdBy: { id: actor.id, name: actor.name },
        createdAt: created.createdAt.toISOString(),
      },
    };
  } catch (error) {
    const { code, constraint } = pgErrorCode(error);
    if (code === "23505" && constraint === OWNER_NAME_CONSTRAINT) {
      return { ok: false, error: "duplicate_name" };
    }
    if (code === "23503") {
      return { ok: false, error: "repository_not_found" };
    }
    throw error;
  }
}

export async function deleteMachineAccount(
  actor: { id: string },
  repositoryId: string,
  accountId: string,
  clientIp?: string | null,
): Promise<boolean> {
  if (!isUuid(accountId)) {
    return false;
  }

  const db = getDb();
  return db.transaction(async (tx) => {
    const [deleted] = await tx
      .delete(machineAccounts)
      .where(
        and(
          eq(machineAccounts.id, accountId),
          eq(machineAccounts.ownerRepositoryId, repositoryId),
        ),
      )
      .returning({
        id: machineAccounts.id,
        name: machineAccounts.name,
        allowPull: machineAccounts.allowPull,
        allowPush: machineAccounts.allowPush,
      });

    if (!deleted) {
      return false;
    }

    await tx.insert(auditLog).values({
      userId: actor.id,
      repositoryId,
      action: "machine_account.delete",
      resource: `machine_account:${deleted.id}`,
      metadata: {
        name: deleted.name,
        allowPull: deleted.allowPull,
        allowPush: deleted.allowPush,
      },
      clientIp: clientIp ?? null,
    });

    return true;
  });
}
