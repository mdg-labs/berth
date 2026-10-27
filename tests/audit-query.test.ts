// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { listAuditLog, parseAuditLogQuery } from "@/lib/audit/query";
import { closeDb, getDb } from "@/lib/db";
import { runMigrations } from "@/lib/db/migrate";
import {
  auditLog,
  machineAccounts,
  repositories,
  users,
} from "@/lib/db/schema";

describe("parseAuditLogQuery", () => {
  it("applies defaults", () => {
    expect(parseAuditLogQuery(new URLSearchParams())).toEqual({
      page: 1,
      pageSize: 25,
      sort: "created_at_desc",
      search: undefined,
      action: undefined,
      actor: undefined,
      resource: undefined,
      from: undefined,
      to: undefined,
    });
  });

  it("parses pagination and filters", () => {
    const params = new URLSearchParams({
      page: "2",
      pageSize: "50",
      sort: "action_asc",
      search: "member",
      action: "member.add",
      actor: "admin",
      resource: "repository:demo",
      from: "2026-01-01",
      to: "2026-12-31",
    });

    expect(parseAuditLogQuery(params)).toEqual({
      page: 2,
      pageSize: 50,
      sort: "action_asc",
      search: "member",
      action: "member.add",
      actor: "admin",
      resource: "repository:demo",
      from: "2026-01-01",
      to: "2026-12-31",
    });
  });

  it("clamps page size and invalid sort", () => {
    const params = new URLSearchParams({
      pageSize: "500",
      sort: "invalid",
    });

    expect(parseAuditLogQuery(params)).toMatchObject({
      pageSize: 100,
      sort: "created_at_desc",
    });
  });

  it("treats blank filters as undefined", () => {
    const params = new URLSearchParams({
      search: "   ",
      action: "",
    });

    expect(parseAuditLogQuery(params)).toMatchObject({
      search: undefined,
      action: undefined,
    });
  });
});

const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)("listAuditLog actor filter against Postgres", () => {
  const suffix = randomUUID().slice(0, 8);
  let repositoryId: string;
  let userId: string;
  let accountId: string;

  beforeAll(async () => {
    await runMigrations();
    const db = getDb();
    const [repo] = await db
      .insert(repositories)
      .values({ name: `audq-${suffix}` })
      .returning({ id: repositories.id });
    repositoryId = repo!.id;
    const [user] = await db
      .insert(users)
      .values({
        email: `alice-${suffix}@example.test`,
        name: `Alice ${suffix}`,
        systemRole: "user",
      })
      .returning({ id: users.id });
    userId = user!.id;
    const [account] = await db
      .insert(machineAccounts)
      .values({
        ownerRepositoryId: repositoryId,
        name: `robot-${suffix}`,
        tokenPrefix: "bm_x",
        tokenHash: `hash-${suffix}`,
        allowPull: true,
        allowPush: true,
      })
      .returning({ id: machineAccounts.id });
    accountId = account!.id;

    await db.insert(auditLog).values([
      {
        userId,
        repositoryId,
        action: "tag.delete",
        resource: `repository:audq-${suffix}/image:app:tag:old`,
      },
      {
        userId: null,
        machineAccountId: accountId,
        repositoryId,
        action: "registry.manifest.push",
        resource: `repository:audq-${suffix}/image:app:tag:new`,
        metadata: {
          machineAccount: { id: accountId, name: `robot-${suffix}`, kind: "repository" },
        },
      },
    ]);
  });

  afterAll(async () => {
    const db = getDb();
    await db.delete(auditLog).where(eq(auditLog.repositoryId, repositoryId));
    await db.delete(machineAccounts).where(eq(machineAccounts.id, accountId));
    await db.delete(repositories).where(inArray(repositories.id, [repositoryId]));
    await db.delete(users).where(eq(users.id, userId));
    await closeDb();
  });

  it("matches machine account names and shows the account as actor", async () => {
    const result = await listAuditLog({ repositoryId, actor: `robot-${suffix}` });

    expect(result.total).toBe(1);
    expect(result.entries[0]?.actor).toMatchObject({
      userId: null,
      machineAccount: { id: accountId, name: `robot-${suffix}`, deleted: false },
    });
  });

  it("keeps filtering by user email and name", async () => {
    for (const actor of [`alice-${suffix}`, `Alice ${suffix}`]) {
      const result = await listAuditLog({ repositoryId, actor });
      expect(result.entries.map((entry) => entry.action)).toEqual(["tag.delete"]);
      expect(result.entries[0]?.actor.machineAccount).toBeNull();
    }
  });

  it("matches the free-text search against machine account names", async () => {
    const result = await listAuditLog({ repositoryId, search: `robot-${suffix}` });
    expect(result.entries.map((entry) => entry.action)).toEqual([
      "registry.manifest.push",
    ]);
  });

  it("still matches the name once the account is deleted", async () => {
    await getDb().delete(machineAccounts).where(eq(machineAccounts.id, accountId));

    const result = await listAuditLog({ repositoryId, actor: `robot-${suffix}` });
    expect(result.total).toBe(1);
    expect(result.entries[0]?.actor.machineAccount).toMatchObject({
      id: accountId,
      name: `robot-${suffix}`,
      deleted: true,
    });
  });
});
