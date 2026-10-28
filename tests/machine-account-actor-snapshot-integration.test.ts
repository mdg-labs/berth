// Copyright (c) 2026 Michael David Guggenbichler (MDG Labs), licensed under Apache-2.0 — see LICENSE

import { randomUUID } from "node:crypto";

import { eq, inArray, like, or } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { listAuditLog } from "@/lib/audit/query";
import { closeDb, getDb } from "@/lib/db";
import { runMigrations } from "@/lib/db/migrate";
import {
  auditLog,
  machineAccounts,
  repositories,
  users,
} from "@/lib/db/schema";
import {
  createHostMachineAccount,
  createMachineAccount,
  deleteMachineAccount,
  deleteMachineAccountAsAdmin,
  rotateMachineAccount,
  updateHostMachineAccount,
  updateMachineAccount,
} from "@/lib/machine-accounts/store";
import {
  purgeExpiredDeletedUsers,
  softDeleteUser,
} from "@/lib/users/lifecycle";

const databaseUrl = process.env.DATABASE_URL;
const DAY_MS = 24 * 60 * 60 * 1000;

describe.skipIf(!databaseUrl)(
  "machine account admin actions keep their actor after a purge",
  () => {
    const suffix = randomUUID().slice(0, 8);
    const userIds: string[] = [];
    let repositoryId: string;
    let adminId: string;
    let actorId: string;
    let actorEmail: string;
    let originalGrace: string | undefined;

    async function makeUser(label: string) {
      const email = `${label}-${suffix}@example.test`;
      const [user] = await getDb()
        .insert(users)
        .values({ email, name: `${label} ${suffix}` })
        .returning({ id: users.id });
      userIds.push(user!.id);
      return { id: user!.id, email };
    }

    beforeAll(async () => {
      originalGrace = process.env.USER_DELETE_GRACE_PERIOD_DAYS;
      process.env.USER_DELETE_GRACE_PERIOD_DAYS = "1";
      await runMigrations();
      const db = getDb();
      const [repo] = await db
        .insert(repositories)
        .values({ name: `macc-snap-${suffix}` })
        .returning({ id: repositories.id, name: repositories.name });
      repositoryId = repo!.id;
      adminId = (await makeUser("admin")).id;
      const actor = await makeUser("operator");
      actorId = actor.id;
      actorEmail = actor.email;

      const expiresAt = new Date(Date.now() + 7 * DAY_MS).toISOString();
      const caller = { id: actorId, name: `operator ${suffix}` };

      const repoAccount = await createMachineAccount(
        caller,
        { id: repositoryId, name: repo!.name },
        {
          name: `repo-${suffix}`,
          description: null,
          allowPull: true,
          allowPush: false,
          expiresAt,
        },
      );
      expect(repoAccount.ok).toBe(true);
      const repoAccountId = repoAccount.ok ? repoAccount.summary.id : "";
      expect(
        await updateMachineAccount(caller, repositoryId, repoAccountId, {
          description: "changed",
          disabled: true,
        }),
      ).toMatchObject({ ok: true });
      expect(
        await rotateMachineAccount(
          caller,
          { repositoryId },
          repoAccountId,
          { resetExpiry: true },
        ),
      ).toMatchObject({ ok: true });
      expect(
        await deleteMachineAccount(caller, repositoryId, repoAccountId),
      ).toBe(true);

      const hostAccount = await createHostMachineAccount(caller, {
        name: `host-${suffix}`,
        description: null,
        repositoryIds: [repositoryId],
        expiresAt,
      });
      expect(hostAccount.ok).toBe(true);
      const hostAccountId = hostAccount.ok ? hostAccount.summary.id : "";
      expect(
        await updateHostMachineAccount(caller, hostAccountId, {
          description: "changed",
          repositoryIds: [repositoryId],
        }),
      ).toMatchObject({ ok: true });
      expect(
        await rotateMachineAccount(caller, null, hostAccountId, {
          resetExpiry: true,
        }),
      ).toMatchObject({ ok: true });
      expect(await deleteMachineAccountAsAdmin(caller, hostAccountId)).toBe(
        true,
      );

      expect(await softDeleteUser(adminId, actorId)).toEqual({ ok: true });
      await db
        .update(users)
        .set({ deletedAt: new Date(Date.now() - 2 * DAY_MS) })
        .where(eq(users.id, actorId));
      await purgeExpiredDeletedUsers();
    });

    afterAll(async () => {
      const db = getDb();
      await db
        .delete(auditLog)
        .where(
          or(
            eq(auditLog.repositoryId, repositoryId),
            like(auditLog.actorEmail, `%-${suffix}@example.test`),
          ),
        );
      await db
        .delete(machineAccounts)
        .where(like(machineAccounts.name, `%-${suffix}`));
      await db.delete(repositories).where(eq(repositories.id, repositoryId));
      await db.delete(users).where(inArray(users.id, userIds));
      if (originalGrace === undefined) {
        delete process.env.USER_DELETE_GRACE_PERIOD_DAYS;
      } else {
        process.env.USER_DELETE_GRACE_PERIOD_DAYS = originalGrace;
      }
      await closeDb();
    });

    it("detaches the purged user and keeps the snapshot on every entry", async () => {
      const rows = await getDb()
        .select({
          action: auditLog.action,
          userId: auditLog.userId,
          email: auditLog.actorEmail,
          name: auditLog.actorName,
        })
        .from(auditLog)
        .where(eq(auditLog.actorEmail, actorEmail));

      const actions = rows.map((row) => row.action);
      expect(actions.filter((a) => a === "machine_account.create")).toHaveLength(2);
      expect(actions.filter((a) => a === "machine_account.delete")).toHaveLength(2);
      expect(actions.filter((a) => a === "machine_account.rotate")).toHaveLength(2);
      expect(actions.filter((a) => a === "machine_account.update")).toHaveLength(2);
      expect(actions).toContain("machine_account.disable");
      for (const row of rows) {
        expect(row.userId).toBeNull();
        expect(row.name).toBe(`operator ${suffix}`);
      }
    });

    it("shows the entries as a deleted user, not as system", async () => {
      const result = await listAuditLog({
        actor: actorEmail,
        action: "machine_account.create",
      });
      expect(result.entries.length).toBeGreaterThan(0);
      for (const entry of result.entries) {
        expect(entry.actor).toMatchObject({
          userId: null,
          email: actorEmail,
          deletedUser: true,
          machineAccount: null,
        });
      }
    });
  },
);
