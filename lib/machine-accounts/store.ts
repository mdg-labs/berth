// Copyright (c) 2026 Michael David Guggenbichler (MDG Labs), licensed under Apache-2.0 — see LICENSE

import { and, asc, eq, inArray, isNull, lt, or } from "drizzle-orm";

import { getDb } from "@/lib/db";
import {
  auditLog,
  machineAccountRepositories,
  machineAccounts,
  repositories,
  users,
} from "@/lib/db/schema";
import { generateToken, hashToken, isTokenExpired } from "@/lib/email/tokens";
import {
  MACHINE_ACCOUNT_PREFIX,
  MACHINE_ACCOUNT_TOKEN_PREFIX_LENGTH,
} from "@/lib/machine-accounts/config";
import type {
  CreateHostMachineAccountInput,
  CreateMachineAccountInput,
  MachineAccountKind,
  MachineAccountRepositoryRef,
  MachineAccountSnapshot,
  MachineAccountSummary,
  ResolvedMachineAccount,
  UpdateHostMachineAccountInput,
} from "@/lib/machine-accounts/types";
import { isUuid } from "@/lib/machine-accounts/validation";
import { PAT_LAST_USED_THROTTLE_MS } from "@/lib/pat/config";

const OWNER_NAME_CONSTRAINT = "machine_accounts_owner_repository_name_idx";
const HOST_NAME_CONSTRAINT = "machine_accounts_host_name_idx";

type MachineAccountActor = { id: string; name: string };

export type CreateMachineAccountResult =
  | { ok: true; secret: string; summary: MachineAccountSummary }
  | { ok: false; error: "duplicate_name" | "repository_not_found" };

export type CreateHostMachineAccountResult =
  | { ok: true; secret: string; summary: MachineAccountSummary }
  | { ok: false; error: "duplicate_name" | "repository_not_found" };

export type UpdateHostMachineAccountResult =
  | { ok: true; summary: MachineAccountSummary }
  | {
      ok: false;
      error: "not_found" | "not_host_account" | "repository_not_found";
    };

export function machineAccountUsername(
  repositoryName: string,
  accountName: string,
): string {
  return `${repositoryName}+${accountName}`;
}

export function hostMachineAccountUsername(accountName: string): string {
  return `host+${accountName}`;
}

type SummaryRow = {
  id: string;
  name: string;
  description: string | null;
  tokenPrefix: string;
  allowPull: boolean;
  allowPush: boolean;
  createdAt: Date;
  createdById: string | null;
  createdByName: string | null;
};

function toSummary(
  row: SummaryRow,
  kind: MachineAccountKind,
  repositoryRefs: MachineAccountRepositoryRef[],
  ownerRepositoryName: string | null,
): MachineAccountSummary {
  return {
    id: row.id,
    kind,
    name: row.name,
    description: row.description,
    username:
      kind === "host" || ownerRepositoryName === null
        ? hostMachineAccountUsername(row.name)
        : machineAccountUsername(ownerRepositoryName, row.name),
    repositories: repositoryRefs,
    tokenPrefix: row.tokenPrefix,
    allowPull: row.allowPull,
    allowPush: row.allowPush,
    createdBy:
      row.createdById && row.createdByName !== null
        ? { id: row.createdById, name: row.createdByName }
        : null,
    createdAt: row.createdAt.toISOString(),
  };
}

function byName(
  left: MachineAccountRepositoryRef,
  right: MachineAccountRepositoryRef,
): number {
  return left.name.localeCompare(right.name);
}

async function listHostRepositories(
  accountIds: string[],
): Promise<Map<string, MachineAccountRepositoryRef[]>> {
  const result = new Map<string, MachineAccountRepositoryRef[]>();
  if (accountIds.length === 0) {
    return result;
  }

  const rows = await getDb()
    .select({
      accountId: machineAccountRepositories.machineAccountId,
      id: repositories.id,
      name: repositories.name,
    })
    .from(machineAccountRepositories)
    .innerJoin(
      repositories,
      eq(machineAccountRepositories.repositoryId, repositories.id),
    )
    .where(inArray(machineAccountRepositories.machineAccountId, accountIds));

  for (const row of rows) {
    const refs = result.get(row.accountId) ?? [];
    refs.push({ id: row.id, name: row.name });
    result.set(row.accountId, refs);
  }
  for (const refs of result.values()) {
    refs.sort(byName);
  }
  return result;
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

  let repositoryIds: string[];
  if (row.ownerRepositoryId) {
    repositoryIds = [row.ownerRepositoryId];
  } else {
    const listed = await db
      .select({ repositoryId: machineAccountRepositories.repositoryId })
      .from(machineAccountRepositories)
      .where(eq(machineAccountRepositories.machineAccountId, row.id));
    repositoryIds = listed.map((entry) => entry.repositoryId);
  }

  return {
    id: row.id,
    name: row.name,
    ownerRepositoryId: row.ownerRepositoryId,
    allowPull: row.allowPull,
    allowPush: row.allowPush,
    repositoryIds,
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

const summaryColumns = {
  id: machineAccounts.id,
  name: machineAccounts.name,
  description: machineAccounts.description,
  tokenPrefix: machineAccounts.tokenPrefix,
  allowPull: machineAccounts.allowPull,
  allowPush: machineAccounts.allowPush,
  createdAt: machineAccounts.createdAt,
  createdById: users.id,
  createdByName: users.name,
};

export async function listMachineAccounts(
  repositoryId: string,
): Promise<MachineAccountSummary[]> {
  const db = getDb();
  const ownRows = await db
    .select({ ...summaryColumns, repositoryName: repositories.name })
    .from(machineAccounts)
    .innerJoin(
      repositories,
      eq(machineAccounts.ownerRepositoryId, repositories.id),
    )
    .leftJoin(users, eq(machineAccounts.createdBy, users.id))
    .where(eq(machineAccounts.ownerRepositoryId, repositoryId))
    .orderBy(asc(machineAccounts.name));

  const hostRows = await db
    .select({ ...summaryColumns, repositoryName: repositories.name })
    .from(machineAccountRepositories)
    .innerJoin(
      machineAccounts,
      eq(machineAccountRepositories.machineAccountId, machineAccounts.id),
    )
    .innerJoin(
      repositories,
      eq(machineAccountRepositories.repositoryId, repositories.id),
    )
    .leftJoin(users, eq(machineAccounts.createdBy, users.id))
    .where(
      and(
        eq(machineAccountRepositories.repositoryId, repositoryId),
        isNull(machineAccounts.ownerRepositoryId),
      ),
    )
    .orderBy(asc(machineAccounts.name));

  return [
    ...ownRows.map((row) =>
      toSummary(
        row,
        "repository",
        [{ id: repositoryId, name: row.repositoryName }],
        row.repositoryName,
      ),
    ),
    ...hostRows.map((row) =>
      toSummary(row, "host", [{ id: repositoryId, name: row.repositoryName }], null),
    ),
  ];
}

export async function listAllMachineAccounts(): Promise<
  MachineAccountSummary[]
> {
  const rows = await getDb()
    .select({
      ...summaryColumns,
      ownerRepositoryId: machineAccounts.ownerRepositoryId,
      ownerRepositoryName: repositories.name,
    })
    .from(machineAccounts)
    .leftJoin(
      repositories,
      eq(machineAccounts.ownerRepositoryId, repositories.id),
    )
    .leftJoin(users, eq(machineAccounts.createdBy, users.id))
    .orderBy(asc(machineAccounts.name), asc(machineAccounts.createdAt));

  const hostRepositories = await listHostRepositories(
    rows.filter((row) => row.ownerRepositoryId === null).map((row) => row.id),
  );

  return rows.map((row) =>
    row.ownerRepositoryId && row.ownerRepositoryName
      ? toSummary(
          row,
          "repository",
          [{ id: row.ownerRepositoryId, name: row.ownerRepositoryName }],
          row.ownerRepositoryName,
        )
      : toSummary(row, "host", hostRepositories.get(row.id) ?? [], null),
  );
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
      summary: toSummary(
        {
          ...created,
          createdById: actor.id,
          createdByName: actor.name,
        },
        "repository",
        [{ id: repository.id, name: repository.name }],
        repository.name,
      ),
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

export async function createHostMachineAccount(
  actor: MachineAccountActor,
  input: CreateHostMachineAccountInput,
  clientIp?: string | null,
): Promise<CreateHostMachineAccountResult> {
  const secret = `${MACHINE_ACCOUNT_PREFIX}${generateToken()}`;

  try {
    const created = await getDb().transaction(async (tx) => {
      const listed = await tx
        .select({ id: repositories.id, name: repositories.name })
        .from(repositories)
        .where(inArray(repositories.id, input.repositoryIds));
      if (listed.length !== input.repositoryIds.length) {
        return null;
      }

      const [row] = await tx
        .insert(machineAccounts)
        .values({
          ownerRepositoryId: null,
          name: input.name,
          description: input.description,
          tokenPrefix: secret.slice(0, MACHINE_ACCOUNT_TOKEN_PREFIX_LENGTH),
          tokenHash: hashToken(secret),
          allowPull: true,
          allowPush: false,
          createdBy: actor.id,
        })
        .returning();

      if (!row) {
        throw new Error("Failed to create machine account");
      }

      await tx.insert(machineAccountRepositories).values(
        listed.map((repository) => ({
          machineAccountId: row.id,
          repositoryId: repository.id,
        })),
      );

      await tx.insert(auditLog).values({
        userId: actor.id,
        repositoryId: null,
        action: "machine_account.create",
        resource: `machine_account:${row.id}`,
        metadata: {
          name: row.name,
          kind: "host",
          allowPull: row.allowPull,
          allowPush: row.allowPush,
          repositoryIds: listed.map((repository) => repository.id).sort(),
        },
        clientIp: clientIp ?? null,
      });

      return { row, listed };
    });

    if (!created) {
      return { ok: false, error: "repository_not_found" };
    }

    return {
      ok: true,
      secret,
      summary: toSummary(
        { ...created.row, createdById: actor.id, createdByName: actor.name },
        "host",
        [...created.listed].sort(byName),
        null,
      ),
    };
  } catch (error) {
    const { code, constraint } = pgErrorCode(error);
    if (code === "23505" && constraint === HOST_NAME_CONSTRAINT) {
      return { ok: false, error: "duplicate_name" };
    }
    if (code === "23503") {
      return { ok: false, error: "repository_not_found" };
    }
    throw error;
  }
}

export async function updateHostMachineAccount(
  actor: { id: string },
  accountId: string,
  input: UpdateHostMachineAccountInput,
  clientIp?: string | null,
): Promise<UpdateHostMachineAccountResult> {
  if (!isUuid(accountId)) {
    return { ok: false, error: "not_found" };
  }

  try {
    return await getDb().transaction(
      async (tx): Promise<UpdateHostMachineAccountResult> => {
        const [account] = await tx
          .select({
            id: machineAccounts.id,
            name: machineAccounts.name,
            description: machineAccounts.description,
            tokenPrefix: machineAccounts.tokenPrefix,
            allowPull: machineAccounts.allowPull,
            allowPush: machineAccounts.allowPush,
            createdAt: machineAccounts.createdAt,
            ownerRepositoryId: machineAccounts.ownerRepositoryId,
            createdById: users.id,
            createdByName: users.name,
          })
          .from(machineAccounts)
          .leftJoin(users, eq(machineAccounts.createdBy, users.id))
          .where(eq(machineAccounts.id, accountId))
          .for("update", { of: machineAccounts });

        if (!account) {
          return { ok: false, error: "not_found" };
        }
        if (account.ownerRepositoryId !== null) {
          return { ok: false, error: "not_host_account" };
        }

        const before = await tx
          .select({ repositoryId: machineAccountRepositories.repositoryId })
          .from(machineAccountRepositories)
          .where(eq(machineAccountRepositories.machineAccountId, account.id));
        const beforeIds = before.map((entry) => entry.repositoryId).sort();

        let afterIds = beforeIds;
        if (input.repositoryIds) {
          const listed = await tx
            .select({ id: repositories.id })
            .from(repositories)
            .where(inArray(repositories.id, input.repositoryIds));
          if (listed.length !== input.repositoryIds.length) {
            return { ok: false, error: "repository_not_found" };
          }
          afterIds = listed.map((entry) => entry.id).sort();

          await tx
            .delete(machineAccountRepositories)
            .where(eq(machineAccountRepositories.machineAccountId, account.id));
          await tx.insert(machineAccountRepositories).values(
            afterIds.map((repositoryId) => ({
              machineAccountId: account.id,
              repositoryId,
            })),
          );
        }

        let description = account.description;
        if (input.description !== undefined) {
          description = input.description;
          await tx
            .update(machineAccounts)
            .set({ description })
            .where(eq(machineAccounts.id, account.id));
        }

        const repositoriesChanged =
          beforeIds.length !== afterIds.length ||
          beforeIds.some((id, index) => id !== afterIds[index]);
        const descriptionChanged = description !== account.description;

        await tx.insert(auditLog).values({
          userId: actor.id,
          repositoryId: null,
          action: "machine_account.update",
          resource: `machine_account:${account.id}`,
          metadata: {
            name: account.name,
            kind: "host",
            ...(repositoriesChanged
              ? { repositoryIds: { before: beforeIds, after: afterIds } }
              : {}),
            ...(descriptionChanged ? { descriptionChanged: true } : {}),
          },
          clientIp: clientIp ?? null,
        });

        const refs = await tx
          .select({ id: repositories.id, name: repositories.name })
          .from(repositories)
          .where(inArray(repositories.id, afterIds));

        return {
          ok: true,
          summary: toSummary(
            { ...account, description },
            "host",
            refs.sort(byName),
            null,
          ),
        };
      },
    );
  } catch (error) {
    if (pgErrorCode(error).code === "23503") {
      return { ok: false, error: "repository_not_found" };
    }
    throw error;
  }
}

export async function deleteMachineAccountAsAdmin(
  actor: { id: string },
  accountId: string,
  clientIp?: string | null,
): Promise<boolean> {
  if (!isUuid(accountId)) {
    return false;
  }

  return getDb().transaction(async (tx) => {
    const [account] = await tx
      .select({ id: machineAccounts.id })
      .from(machineAccounts)
      .where(eq(machineAccounts.id, accountId))
      .for("update");

    if (!account) {
      return false;
    }

    const listed = await tx
      .select({ repositoryId: machineAccountRepositories.repositoryId })
      .from(machineAccountRepositories)
      .where(eq(machineAccountRepositories.machineAccountId, account.id));

    const [deleted] = await tx
      .delete(machineAccounts)
      .where(eq(machineAccounts.id, account.id))
      .returning({
        id: machineAccounts.id,
        name: machineAccounts.name,
        ownerRepositoryId: machineAccounts.ownerRepositoryId,
        allowPull: machineAccounts.allowPull,
        allowPush: machineAccounts.allowPush,
      });

    if (!deleted) {
      return false;
    }

    const isHost = deleted.ownerRepositoryId === null;
    await tx.insert(auditLog).values({
      userId: actor.id,
      repositoryId: deleted.ownerRepositoryId,
      action: "machine_account.delete",
      resource: `machine_account:${deleted.id}`,
      metadata: {
        name: deleted.name,
        kind: isHost ? "host" : "repository",
        allowPull: deleted.allowPull,
        allowPush: deleted.allowPush,
        ...(isHost
          ? { repositoryIds: listed.map((entry) => entry.repositoryId).sort() }
          : {}),
      },
      clientIp: clientIp ?? null,
    });

    return true;
  });
}
