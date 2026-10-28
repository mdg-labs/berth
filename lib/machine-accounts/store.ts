// Copyright (c) 2026 Michael David Guggenbichler (MDG Labs), licensed under Apache-2.0 — see LICENSE

import {
  and,
  asc,
  eq,
  exists,
  gt,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  or,
  type SQL,
} from "drizzle-orm";

import { actorSnapshot } from "@/lib/audit/log";
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
  RotateMachineAccountInput,
  UpdateHostMachineAccountInput,
  UpdateMachineAccountInput,
} from "@/lib/machine-accounts/types";
import { isUuid } from "@/lib/machine-accounts/validation";
import { getPatPolicy, PAT_LAST_USED_THROTTLE_MS } from "@/lib/pat/config";
import {
  computeRotatedPatExpiry,
  expiryLifetimeSeconds,
  validatePatExpiry,
  type PatValidationError,
} from "@/lib/pat/validation";

const OWNER_NAME_CONSTRAINT = "machine_accounts_owner_repository_name_idx";
const HOST_NAME_CONSTRAINT = "machine_accounts_host_name_idx";

type MachineAccountActor = { id: string; name: string };

export type MachineAccountExpiryError = Extract<
  PatValidationError,
  "never_expire_not_allowed" | "expiry_in_past" | "expiry_exceeds_max"
>;

export type CreateMachineAccountResult =
  | { ok: true; secret: string; summary: MachineAccountSummary }
  | {
      ok: false;
      error:
        | "duplicate_name"
        | "repository_not_found"
        | MachineAccountExpiryError;
    };

export type CreateHostMachineAccountResult =
  | { ok: true; secret: string; summary: MachineAccountSummary }
  | {
      ok: false;
      error:
        | "duplicate_name"
        | "repository_not_found"
        | MachineAccountExpiryError;
    };

export type RotateMachineAccountResult =
  | { ok: true; secret: string; summary: MachineAccountSummary }
  | {
      ok: false;
      error: "not_found" | "token_expired" | MachineAccountExpiryError;
    };

export type UpdateMachineAccountResult =
  | { ok: true; summary: MachineAccountSummary }
  | { ok: false; error: "not_found" };

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
  expiresAt: Date | null;
  disabledAt: Date | null;
  lastUsedAt: Date | null;
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
    expiresAt: row.expiresAt?.toISOString() ?? null,
    disabledAt: row.disabledAt?.toISOString() ?? null,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
  };
}

type ExpiryResult =
  | { ok: true; expiresAt: Date | null }
  | { ok: false; error: MachineAccountExpiryError };

async function resolveCreateExpiry(
  expiresAt: string | null,
): Promise<ExpiryResult> {
  const error = validatePatExpiry(expiresAt, await getPatPolicy());
  if (error) {
    return { ok: false, error: error as MachineAccountExpiryError };
  }
  return { ok: true, expiresAt: expiresAt === null ? null : new Date(expiresAt) };
}

function byName(
  left: MachineAccountRepositoryRef,
  right: MachineAccountRepositoryRef,
): number {
  return left.name.localeCompare(right.name);
}

type Database = ReturnType<typeof getDb>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Executor = Database | Transaction;

async function listHostRepositories(
  accountIds: string[],
  executor: Executor = getDb(),
): Promise<Map<string, MachineAccountRepositoryRef[]>> {
  const result = new Map<string, MachineAccountRepositoryRef[]>();
  if (accountIds.length === 0) {
    return result;
  }

  const rows = await executor
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
  expiresAt: machineAccounts.expiresAt,
  disabledAt: machineAccounts.disabledAt,
  lastUsedAt: machineAccounts.lastUsedAt,
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

export type MachineAccountStatus = "active" | "disabled" | "expired";

export type AdminMachineAccountSummary = MachineAccountSummary & {
  status: MachineAccountStatus;
};

export type MachineAccountFilters = {
  kind?: MachineAccountKind;
  repositoryId?: string;
  status?: MachineAccountStatus;
};

function machineAccountStatus(
  summary: MachineAccountSummary,
  now: number,
): MachineAccountStatus {
  if (summary.disabledAt !== null) {
    return "disabled";
  }
  if (summary.expiresAt !== null && new Date(summary.expiresAt).getTime() <= now) {
    return "expired";
  }
  return "active";
}

function machineAccountFilterConditions(
  filters: MachineAccountFilters,
  now: Date,
): SQL[] {
  const conditions: SQL[] = [];

  if (filters.kind === "repository") {
    conditions.push(isNotNull(machineAccounts.ownerRepositoryId));
  } else if (filters.kind === "host") {
    conditions.push(isNull(machineAccounts.ownerRepositoryId));
  }

  if (filters.repositoryId) {
    const owned = eq(machineAccounts.ownerRepositoryId, filters.repositoryId);
    const listed = exists(
      getDb()
        .select({ one: machineAccountRepositories.machineAccountId })
        .from(machineAccountRepositories)
        .where(
          and(
            eq(machineAccountRepositories.machineAccountId, machineAccounts.id),
            eq(machineAccountRepositories.repositoryId, filters.repositoryId),
          ),
        ),
    );
    const either = or(owned, listed);
    if (either) {
      conditions.push(either);
    }
  }

  if (filters.status === "disabled") {
    conditions.push(isNotNull(machineAccounts.disabledAt));
  } else if (filters.status === "expired") {
    conditions.push(
      isNull(machineAccounts.disabledAt),
      isNotNull(machineAccounts.expiresAt),
      lte(machineAccounts.expiresAt, now),
    );
  } else if (filters.status === "active") {
    const notExpired = or(
      isNull(machineAccounts.expiresAt),
      gt(machineAccounts.expiresAt, now),
    );
    conditions.push(isNull(machineAccounts.disabledAt));
    if (notExpired) {
      conditions.push(notExpired);
    }
  }

  return conditions;
}

export async function listAllMachineAccounts(
  filters: MachineAccountFilters = {},
): Promise<AdminMachineAccountSummary[]> {
  const now = new Date();
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
    .where(and(...machineAccountFilterConditions(filters, now)))
    .orderBy(asc(machineAccounts.name), asc(machineAccounts.createdAt));

  const hostRepositories = await listHostRepositories(
    rows.filter((row) => row.ownerRepositoryId === null).map((row) => row.id),
  );

  return rows.map((row) => {
    const summary =
      row.ownerRepositoryId && row.ownerRepositoryName
        ? toSummary(
            row,
            "repository",
            [{ id: row.ownerRepositoryId, name: row.ownerRepositoryName }],
            row.ownerRepositoryName,
          )
        : toSummary(row, "host", hostRepositories.get(row.id) ?? [], null);
    return { ...summary, status: machineAccountStatus(summary, now.getTime()) };
  });
}

export async function createMachineAccount(
  actor: MachineAccountActor,
  repository: { id: string; name: string },
  input: CreateMachineAccountInput,
  clientIp?: string | null,
): Promise<CreateMachineAccountResult> {
  const expiry = await resolveCreateExpiry(input.expiresAt);
  if (!expiry.ok) {
    return expiry;
  }

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
          expiresAt: expiry.expiresAt,
          expiryLifetimeSeconds: expiryLifetimeSeconds(
            expiry.expiresAt,
            new Date(),
          ),
          createdBy: actor.id,
        })
        .returning();

      if (!row) {
        throw new Error("Failed to create machine account");
      }

      await tx.insert(auditLog).values({
        userId: actor.id,
        ...actorSnapshot(actor.id),
        repositoryId: repository.id,
        action: "machine_account.create",
        resource: `machine_account:${row.id}`,
        metadata: {
          name: row.name,
          allowPull: row.allowPull,
          allowPush: row.allowPush,
          expiresAt: row.expiresAt?.toISOString() ?? null,
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
      ...actorSnapshot(actor.id),
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
  const expiry = await resolveCreateExpiry(input.expiresAt);
  if (!expiry.ok) {
    return expiry;
  }

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
          expiresAt: expiry.expiresAt,
          expiryLifetimeSeconds: expiryLifetimeSeconds(
            expiry.expiresAt,
            new Date(),
          ),
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
        ...actorSnapshot(actor.id),
        repositoryId: null,
        action: "machine_account.create",
        resource: `machine_account:${row.id}`,
        metadata: {
          name: row.name,
          kind: "host",
          allowPull: row.allowPull,
          allowPush: row.allowPush,
          expiresAt: row.expiresAt?.toISOString() ?? null,
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

type LifecycleAccount = {
  id: string;
  name: string;
  disabledAt: Date | null;
  repositoryId: string | null;
  kind: MachineAccountKind;
};

async function applyDisabled(
  tx: Transaction,
  actor: { id: string },
  account: LifecycleAccount,
  disabled: boolean | undefined,
  clientIp?: string | null,
): Promise<Date | null> {
  if (disabled === undefined || (account.disabledAt !== null) === disabled) {
    return account.disabledAt;
  }

  const disabledAt = disabled ? new Date() : null;
  await tx
    .update(machineAccounts)
    .set({ disabledAt })
    .where(eq(machineAccounts.id, account.id));

  await tx.insert(auditLog).values({
    userId: actor.id,
    ...actorSnapshot(actor.id),
    repositoryId: account.repositoryId,
    action: disabled ? "machine_account.disable" : "machine_account.enable",
    resource: `machine_account:${account.id}`,
    metadata: { name: account.name, kind: account.kind },
    clientIp: clientIp ?? null,
  });

  return disabledAt;
}

async function loadMachineAccountSummary(
  executor: Executor,
  accountId: string,
): Promise<MachineAccountSummary> {
  const [row] = await executor
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
    .where(eq(machineAccounts.id, accountId));

  if (!row) {
    throw new Error("Failed to load machine account");
  }

  if (row.ownerRepositoryId && row.ownerRepositoryName) {
    return toSummary(
      row,
      "repository",
      [{ id: row.ownerRepositoryId, name: row.ownerRepositoryName }],
      row.ownerRepositoryName,
    );
  }

  const refs = await listHostRepositories([row.id], executor);
  return toSummary(row, "host", refs.get(row.id) ?? [], null);
}

export async function updateMachineAccount(
  actor: { id: string },
  repositoryId: string,
  accountId: string,
  input: UpdateMachineAccountInput,
  clientIp?: string | null,
): Promise<UpdateMachineAccountResult> {
  if (!isUuid(accountId)) {
    return { ok: false, error: "not_found" };
  }

  return getDb().transaction(
    async (tx): Promise<UpdateMachineAccountResult> => {
      const [account] = await tx
        .select({
          id: machineAccounts.id,
          name: machineAccounts.name,
          description: machineAccounts.description,
          disabledAt: machineAccounts.disabledAt,
        })
        .from(machineAccounts)
        .where(
          and(
            eq(machineAccounts.id, accountId),
            eq(machineAccounts.ownerRepositoryId, repositoryId),
          ),
        )
        .for("update");

      if (!account) {
        return { ok: false, error: "not_found" };
      }

      if (
        input.description !== undefined &&
        input.description !== account.description
      ) {
        await tx
          .update(machineAccounts)
          .set({ description: input.description })
          .where(eq(machineAccounts.id, account.id));

        await tx.insert(auditLog).values({
          userId: actor.id,
          ...actorSnapshot(actor.id),
          repositoryId,
          action: "machine_account.update",
          resource: `machine_account:${account.id}`,
          metadata: {
            name: account.name,
            kind: "repository",
            descriptionChanged: true,
          },
          clientIp: clientIp ?? null,
        });
      }

      await applyDisabled(
        tx,
        actor,
        { ...account, repositoryId, kind: "repository" },
        input.disabled,
        clientIp,
      );

      return {
        ok: true,
        summary: await loadMachineAccountSummary(tx, account.id),
      };
    },
  );
}

export async function rotateMachineAccount(
  actor: { id: string },
  scope: { repositoryId: string } | null,
  accountId: string,
  input: RotateMachineAccountInput,
  clientIp?: string | null,
): Promise<RotateMachineAccountResult> {
  if (!isUuid(accountId)) {
    return { ok: false, error: "not_found" };
  }

  const policy = await getPatPolicy();
  const secret = `${MACHINE_ACCOUNT_PREFIX}${generateToken()}`;

  return getDb().transaction(
    async (tx): Promise<RotateMachineAccountResult> => {
      const [account] = await tx
        .select({
          id: machineAccounts.id,
          name: machineAccounts.name,
          ownerRepositoryId: machineAccounts.ownerRepositoryId,
          createdAt: machineAccounts.createdAt,
          expiresAt: machineAccounts.expiresAt,
          expiryLifetimeSeconds: machineAccounts.expiryLifetimeSeconds,
        })
        .from(machineAccounts)
        .where(
          and(
            eq(machineAccounts.id, accountId),
            scope
              ? eq(machineAccounts.ownerRepositoryId, scope.repositoryId)
              : undefined,
          ),
        )
        .for("update");

      if (!account) {
        return { ok: false, error: "not_found" };
      }

      const resetExpiry = input.resetExpiry ?? false;
      let nextExpiresAt: Date | null;
      let nextLifetimeSeconds = account.expiryLifetimeSeconds;
      if (input.expiresAt !== undefined) {
        const error = validatePatExpiry(input.expiresAt, policy);
        if (error) {
          return { ok: false, error: error as MachineAccountExpiryError };
        }
        nextExpiresAt =
          input.expiresAt === null ? null : new Date(input.expiresAt);
        nextLifetimeSeconds = expiryLifetimeSeconds(nextExpiresAt, new Date());
      } else {
        const computed = computeRotatedPatExpiry(
          account,
          resetExpiry,
          policy,
        );
        if (!computed.ok) {
          return {
            ok: false,
            error: computed.error as MachineAccountExpiryError | "token_expired",
          };
        }
        nextExpiresAt = computed.expiresAt;
      }

      await tx
        .update(machineAccounts)
        .set({
          tokenPrefix: secret.slice(0, MACHINE_ACCOUNT_TOKEN_PREFIX_LENGTH),
          tokenHash: hashToken(secret),
          expiresAt: nextExpiresAt,
          expiryLifetimeSeconds: nextLifetimeSeconds,
          lastUsedAt: null,
        })
        .where(eq(machineAccounts.id, account.id));

      await tx.insert(auditLog).values({
        userId: actor.id,
        ...actorSnapshot(actor.id),
        repositoryId: account.ownerRepositoryId,
        action: "machine_account.rotate",
        resource: `machine_account:${account.id}`,
        metadata: {
          name: account.name,
          kind: account.ownerRepositoryId ? "repository" : "host",
          resetExpiry,
          expiresAt: nextExpiresAt?.toISOString() ?? null,
        },
        clientIp: clientIp ?? null,
      });

      return {
        ok: true,
        secret,
        summary: await loadMachineAccountSummary(tx, account.id),
      };
    },
  );
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
            expiresAt: machineAccounts.expiresAt,
            disabledAt: machineAccounts.disabledAt,
            lastUsedAt: machineAccounts.lastUsedAt,
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

        const disabledAt = await applyDisabled(
          tx,
          actor,
          { ...account, repositoryId: null, kind: "host" },
          input.disabled,
          clientIp,
        );

        const repositoriesChanged =
          beforeIds.length !== afterIds.length ||
          beforeIds.some((id, index) => id !== afterIds[index]);
        const descriptionChanged = description !== account.description;

        if (input.description !== undefined || input.repositoryIds) {
          await tx.insert(auditLog).values({
            userId: actor.id,
            ...actorSnapshot(actor.id),
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
        }

        const refs = await tx
          .select({ id: repositories.id, name: repositories.name })
          .from(repositories)
          .where(inArray(repositories.id, afterIds));

        return {
          ok: true,
          summary: toSummary(
            { ...account, description, disabledAt },
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
      ...actorSnapshot(actor.id),
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
