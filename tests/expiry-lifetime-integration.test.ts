// Copyright (c) 2026 Michael David Guggenbichler (MDG Labs), licensed under Apache-2.0 — see LICENSE

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const policyMock = vi.hoisted(() => ({
  current: { patMaxValidityDays: 30 as number | null, patAllowNeverExpire: true },
}));

vi.mock("@/lib/pat/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/pat/config")>();
  return { ...actual, getPatPolicy: async () => policyMock.current };
});

import { closeDb, getDb } from "@/lib/db";
import { runMigrations } from "@/lib/db/migrate";
import {
  auditLog,
  machineAccounts,
  personalAccessTokens,
  repositories,
  users,
} from "@/lib/db/schema";
import {
  createMachineAccount,
  rotateMachineAccount,
} from "@/lib/machine-accounts/store";
import { previewResetExpiry } from "@/lib/pat/expiry-reset";
import {
  createPersonalAccessToken,
  listPersonalAccessTokens,
  rotatePersonalAccessToken,
} from "@/lib/pat/store";

const databaseUrl = process.env.DATABASE_URL;
const DAY_MS = 24 * 60 * 60 * 1000;
const SECOND_TOLERANCE_MS = 5000;

describe.skipIf(!databaseUrl)("reset expiry keeps the chosen lifetime", () => {
  const suffix = randomUUID().slice(0, 8);
  let userId: string;
  let userEmail: string;
  let repositoryId: string;
  let repositoryName: string;
  const patIds: string[] = [];
  const accountIds: string[] = [];

  async function ageRow(
    table: typeof personalAccessTokens | typeof machineAccounts,
    id: string,
    days: number,
  ) {
    const interval = sql`make_interval(secs => ${days * 24 * 60 * 60})`;
    await getDb()
      .update(table)
      .set({
        createdAt: sql`${table.createdAt} - ${interval}`,
        expiresAt: sql`${table.expiresAt} - ${interval}`,
      })
      .where(eq(table.id, id));
  }

  function expectNear(actual: Date | string | null, expectedMs: number) {
    expect(actual).not.toBeNull();
    expect(
      Math.abs(new Date(actual as Date | string).getTime() - expectedMs),
    ).toBeLessThan(SECOND_TOLERANCE_MS);
  }

  beforeAll(async () => {
    await runMigrations();
    const db = getDb();
    userEmail = `lifetime-${suffix}@example.test`;
    const [user] = await db
      .insert(users)
      .values({ email: userEmail, name: `lifetime ${suffix}` })
      .returning({ id: users.id });
    userId = user!.id;
    repositoryName = `lifetime-${suffix}`;
    const [repo] = await db
      .insert(repositories)
      .values({ name: repositoryName })
      .returning({ id: repositories.id });
    repositoryId = repo!.id;
  });

  afterAll(async () => {
    const db = getDb();
    for (const id of accountIds) {
      await db.delete(auditLog).where(eq(auditLog.resource, `machine_account:${id}`));
      await db.delete(machineAccounts).where(eq(machineAccounts.id, id));
    }
    for (const id of patIds) {
      await db.delete(auditLog).where(eq(auditLog.resource, `pat:${id}`));
      await db.delete(personalAccessTokens).where(eq(personalAccessTokens.id, id));
    }
    await db.delete(users).where(eq(users.id, userId));
    await db.delete(repositories).where(eq(repositories.id, repositoryId));
    await closeDb();
  });

  it("resets a personal access token to its created lifetime however often it is reset", async () => {
    policyMock.current = { patMaxValidityDays: 30, patAllowNeverExpire: true };
    const created = await createPersonalAccessToken(
      { id: userId, email: userEmail, systemRole: "user" },
      {
        name: `lifetime-${suffix}`,
        allowPull: true,
        allowPush: false,
        expiresAt: new Date(Date.now() + 30 * DAY_MS - 60_000).toISOString(),
        repositoryIds: null,
      },
    );
    expect(created.ok).toBe(true);
    const id = created.ok ? created.summary.id : "";
    patIds.push(id);

    for (let round = 0; round < 3; round += 1) {
      await ageRow(personalAccessTokens, id, 25);
      const listed = (await listPersonalAccessTokens(userId)).find(
        (entry) => entry.id === id,
      );
      expect(listed?.expiryLifetimeSeconds).toBeGreaterThan(0);
      expectNear(
        previewResetExpiry(listed!, Date.now()),
        Date.now() + 30 * DAY_MS - 60_000,
      );
      const rotated = await rotatePersonalAccessToken(userId, id, {
        resetExpiry: true,
      });
      expect(rotated.ok).toBe(true);
      if (rotated.ok) {
        expectNear(rotated.summary.expiresAt, Date.now() + 30 * DAY_MS - 60_000);
      }
    }
  });

  it("resets a machine account to its created lifetime however often it is reset", async () => {
    policyMock.current = { patMaxValidityDays: 30, patAllowNeverExpire: true };
    const actor = { id: userId, name: `lifetime ${suffix}` };
    const created = await createMachineAccount(
      actor,
      { id: repositoryId, name: repositoryName },
      {
        name: `acct-${suffix}`,
        description: null,
        allowPull: true,
        allowPush: false,
        expiresAt: new Date(Date.now() + 30 * DAY_MS - 60_000).toISOString(),
      },
    );
    expect(created.ok).toBe(true);
    const id = created.ok ? created.summary.id : "";
    accountIds.push(id);

    for (let round = 0; round < 3; round += 1) {
      await ageRow(machineAccounts, id, 25);
      const rotated = await rotateMachineAccount(
        actor,
        { repositoryId },
        id,
        { resetExpiry: true },
      );
      expect(rotated.ok).toBe(true);
      if (rotated.ok) {
        expectNear(rotated.summary.expiresAt, Date.now() + 30 * DAY_MS - 60_000);
      }
    }
  });

  it("follows an explicit expiry set while rotating a machine account", async () => {
    policyMock.current = { patMaxValidityDays: 30, patAllowNeverExpire: true };
    const actor = { id: userId, name: `lifetime ${suffix}` };
    const created = await createMachineAccount(
      actor,
      { id: repositoryId, name: repositoryName },
      {
        name: `explicit-${suffix}`,
        description: null,
        allowPull: true,
        allowPush: false,
        expiresAt: new Date(Date.now() + 20 * DAY_MS).toISOString(),
      },
    );
    expect(created.ok).toBe(true);
    const id = created.ok ? created.summary.id : "";
    accountIds.push(id);

    await ageRow(machineAccounts, id, 5);
    const explicit = await rotateMachineAccount(
      actor,
      { repositoryId },
      id,
      { expiresAt: new Date(Date.now() + 7 * DAY_MS).toISOString() },
    );
    expect(explicit.ok).toBe(true);

    await ageRow(machineAccounts, id, 3);
    const reset = await rotateMachineAccount(actor, { repositoryId }, id, {
      resetExpiry: true,
    });
    expect(reset.ok).toBe(true);
    if (reset.ok) {
      expectNear(reset.summary.expiresAt, Date.now() + 7 * DAY_MS);
    }
  });

  it("keeps a never-expiring account never-expiring on reset", async () => {
    policyMock.current = { patMaxValidityDays: null, patAllowNeverExpire: true };
    const actor = { id: userId, name: `lifetime ${suffix}` };
    const created = await createMachineAccount(
      actor,
      { id: repositoryId, name: repositoryName },
      {
        name: `never-${suffix}`,
        description: null,
        allowPull: true,
        allowPush: false,
        expiresAt: null,
      },
    );
    expect(created.ok).toBe(true);
    const id = created.ok ? created.summary.id : "";
    accountIds.push(id);
    const reset = await rotateMachineAccount(actor, { repositoryId }, id, {
      resetExpiry: true,
    });
    expect(reset.ok).toBe(true);
    if (reset.ok) {
      expect(reset.summary.expiresAt).toBeNull();
    }
  });

  it("backfills the lifetime of existing rows from expires_at - created_at", async () => {
    const db = getDb();
    const createdAt = new Date("2026-01-01T00:00:00.000Z");
    const [expiring] = await db
      .insert(personalAccessTokens)
      .values({
        userId,
        name: `backfill-a-${suffix}`,
        tokenPrefix: "bt_backfilla",
        tokenHash: `backfill-a-${suffix}`,
        allowPull: true,
        allowPush: false,
        createdAt,
        expiresAt: new Date(createdAt.getTime() + 10 * DAY_MS + 1500),
      })
      .returning({ id: personalAccessTokens.id });
    const [neverExpiring] = await db
      .insert(personalAccessTokens)
      .values({
        userId,
        name: `backfill-b-${suffix}`,
        tokenPrefix: "bt_backfillb",
        tokenHash: `backfill-b-${suffix}`,
        allowPull: true,
        allowPush: false,
        createdAt,
      })
      .returning({ id: personalAccessTokens.id });
    const [account] = await db
      .insert(machineAccounts)
      .values({
        ownerRepositoryId: repositoryId,
        name: `backfill-${suffix}`,
        tokenPrefix: "bm_backfill",
        tokenHash: `backfill-m-${suffix}`,
        allowPull: true,
        allowPush: false,
        createdAt,
        expiresAt: new Date(createdAt.getTime() + 7 * DAY_MS),
      })
      .returning({ id: machineAccounts.id });
    patIds.push(expiring!.id, neverExpiring!.id);
    accountIds.push(account!.id);

    const migration = readFileSync(
      join(process.cwd(), "drizzle", "0014_backfill_expiry_lifetime_seconds.sql"),
      "utf8",
    );
    for (const statement of migration.split("--> statement-breakpoint")) {
      await db.execute(sql.raw(statement));
    }

    const [pat] = await db
      .select({ lifetime: personalAccessTokens.expiryLifetimeSeconds })
      .from(personalAccessTokens)
      .where(eq(personalAccessTokens.id, expiring!.id));
    const [never] = await db
      .select({ lifetime: personalAccessTokens.expiryLifetimeSeconds })
      .from(personalAccessTokens)
      .where(eq(personalAccessTokens.id, neverExpiring!.id));
    const [machine] = await db
      .select({ lifetime: machineAccounts.expiryLifetimeSeconds })
      .from(machineAccounts)
      .where(eq(machineAccounts.id, account!.id));
    expect(pat!.lifetime).toBe(10 * 24 * 60 * 60 + 1);
    expect(never!.lifetime).toBeNull();
    expect(machine!.lifetime).toBe(7 * 24 * 60 * 60);
  });
});
