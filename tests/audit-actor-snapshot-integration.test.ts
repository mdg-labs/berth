// Copyright (c) 2026 Michael David Guggenbichler (MDG Labs), licensed under Apache-2.0 — see LICENSE

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { and, eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { writeAuditLog } from "@/lib/audit/log";
import { listAuditLog } from "@/lib/audit/query";
import { closeDb, getDb } from "@/lib/db";
import { runMigrations } from "@/lib/db/migrate";
import { auditLog, repositories, users } from "@/lib/db/schema";
import {
  purgeExpiredDeletedUsers,
  softDeleteUser,
} from "@/lib/users/lifecycle";

const databaseUrl = process.env.DATABASE_URL;
const DAY_MS = 24 * 60 * 60 * 1000;

describe.skipIf(!databaseUrl)("audit actor snapshot against Postgres", () => {
  const suffix = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  let repositoryId: string;
  let adminId: string;
  let aliceId: string;
  let bobId: string;
  let originalGrace: string | undefined;

  async function makeUser(label: string) {
    const [user] = await getDb()
      .insert(users)
      .values({
        email: `${label}-${suffix}@example.test`,
        name: `${label} ${suffix}`,
      })
      .returning({ id: users.id });
    userIds.push(user!.id);
    return user!.id;
  }

  beforeAll(async () => {
    originalGrace = process.env.USER_DELETE_GRACE_PERIOD_DAYS;
    process.env.USER_DELETE_GRACE_PERIOD_DAYS = "1";
    await runMigrations();
    const db = getDb();
    const [repo] = await db
      .insert(repositories)
      .values({ name: `snap-${suffix}` })
      .returning({ id: repositories.id });
    repositoryId = repo!.id;
    adminId = await makeUser("admin");
    aliceId = await makeUser("alice");
    bobId = await makeUser("bob");

    for (const [userId, action] of [
      [aliceId, "tag.delete"],
      [bobId, "member.add"],
    ] as const) {
      await writeAuditLog({
        userId,
        repositoryId,
        action,
        resource: `repository:snap-${suffix}`,
      });
    }
    await writeAuditLog({
      userId: null,
      repositoryId,
      action: "system.job",
      resource: `repository:snap-${suffix}`,
    });

    const soft = await softDeleteUser(adminId, aliceId);
    expect(soft).toEqual({ ok: true });
    await db
      .update(users)
      .set({ deletedAt: new Date(Date.now() - 2 * DAY_MS) })
      .where(eq(users.id, aliceId));
    await purgeExpiredDeletedUsers();
  });

  afterAll(async () => {
    const db = getDb();
    await db.delete(auditLog).where(eq(auditLog.repositoryId, repositoryId));
    await db.delete(repositories).where(eq(repositories.id, repositoryId));
    await db.delete(users).where(inArray(users.id, userIds));
    if (originalGrace === undefined) {
      delete process.env.USER_DELETE_GRACE_PERIOD_DAYS;
    } else {
      process.env.USER_DELETE_GRACE_PERIOD_DAYS = originalGrace;
    }
    await closeDb();
  });

  it("keeps the snapshot of a purged user and detaches the user id", async () => {
    const [stored] = await getDb()
      .select({ userId: auditLog.userId, email: auditLog.actorEmail })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.repositoryId, repositoryId),
          eq(auditLog.action, "tag.delete"),
        ),
      );
    expect(stored).toEqual({
      userId: null,
      email: `alice-${suffix}@example.test`,
    });

    const result = await listAuditLog({ repositoryId, action: "tag.delete" });
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]?.actor).toEqual({
      userId: null,
      email: `alice-${suffix}@example.test`,
      name: `alice ${suffix}`,
      deletedUser: true,
      machineAccount: null,
    });
  });

  it("shows a live user by the live row and a system entry with no actor", async () => {
    const live = await listAuditLog({ repositoryId, action: "member.add" });
    expect(live.entries[0]?.actor).toMatchObject({
      userId: bobId,
      email: `bob-${suffix}@example.test`,
      deletedUser: false,
    });

    const system = await listAuditLog({ repositoryId, action: "system.job" });
    expect(system.entries[0]?.actor).toEqual({
      userId: null,
      email: null,
      name: null,
      deletedUser: false,
      machineAccount: null,
    });
  });

  it("filters by live and purged actors", async () => {
    for (const actor of [`alice-${suffix}`, `alice ${suffix}`]) {
      const result = await listAuditLog({ repositoryId, actor });
      expect(result.entries.map((entry) => entry.action)).toEqual(["tag.delete"]);
    }
    const live = await listAuditLog({ repositoryId, actor: `bob-${suffix}` });
    expect(live.entries.map((entry) => entry.action)).toEqual(["member.add"]);

    const search = await listAuditLog({ repositoryId, search: `alice-${suffix}` });
    expect(search.entries.map((entry) => entry.action)).toEqual(["tag.delete"]);
  });

  it("sorts by actor with purged users placed by their snapshot", async () => {
    const asc = await listAuditLog({ repositoryId, sort: "actor_asc" });
    expect(asc.entries.map((entry) => entry.action)).toEqual([
      "tag.delete",
      "member.add",
      "system.job",
    ]);
    const desc = await listAuditLog({ repositoryId, sort: "actor_desc" });
    expect(desc.entries.map((entry) => entry.action)).toEqual([
      "system.job",
      "member.add",
      "tag.delete",
    ]);
  });

  it("backfills existing rows from users in the migration", async () => {
    const db = getDb();
    const [row] = await db
      .insert(auditLog)
      .values({
        userId: bobId,
        repositoryId,
        action: "legacy.entry",
        resource: `repository:snap-${suffix}`,
      })
      .returning({ id: auditLog.id });

    const migration = readFileSync(
      path.join(
        process.cwd(),
        "drizzle/0012_backfill_audit_actor_snapshot.sql",
      ),
      "utf8",
    );
    await db.execute(sql.raw(migration));

    const [after] = await db
      .select({ email: auditLog.actorEmail, name: auditLog.actorName })
      .from(auditLog)
      .where(eq(auditLog.id, row!.id));
    expect(after).toEqual({
      email: `bob-${suffix}@example.test`,
      name: `bob ${suffix}`,
    });
  });
});
