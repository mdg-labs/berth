// Copyright (c) 2026 Michael David Guggenbichler (MDG Labs), licensed under Apache-2.0 — see LICENSE

import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { listAuditLog } from "@/lib/audit/query";
import { closeDb, getDb } from "@/lib/db";
import { runMigrations } from "@/lib/db/migrate";
import {
  auditLog,
  machineAccounts,
  personalAccessTokens,
  pullEvents,
  repositories,
  repositoryInvites,
  sessions,
  systemSettings,
  userInvites,
  users,
} from "@/lib/db/schema";
import { createSession, getActiveSession } from "@/lib/session/store";
import {
  purgeExpiredDeletedUsers,
  softDeleteUser,
} from "@/lib/users/lifecycle";

const databaseUrl = process.env.DATABASE_URL;
const suffix = randomUUID().slice(0, 8);
const DAY_MS = 24 * 60 * 60 * 1000;

describe.skipIf(!databaseUrl)("purging deleted users against Postgres", () => {
  const userIds: string[] = [];
  const repositoryIds: string[] = [];
  const accountIds: string[] = [];
  const auditIds: string[] = [];
  const inviteIds: string[] = [];
  const repositoryInviteIds: string[] = [];
  let originalGrace: string | undefined;
  let originalSettingsUpdatedBy: string | null | undefined;
  let settingsRowExisted = false;

  beforeAll(async () => {
    originalGrace = process.env.USER_DELETE_GRACE_PERIOD_DAYS;
    process.env.USER_DELETE_GRACE_PERIOD_DAYS = "1";
    await runMigrations();
  });

  afterEach(async () => {
    const db = getDb();
    if (settingsRowExisted) {
      await db
        .update(systemSettings)
        .set({ updatedBy: originalSettingsUpdatedBy ?? null })
        .where(eq(systemSettings.id, "default"));
    } else {
      await db.delete(systemSettings).where(eq(systemSettings.id, "default"));
    }
  });

  afterAll(async () => {
    const db = getDb();
    if (auditIds.length > 0) {
      await db.delete(auditLog).where(inArray(auditLog.id, auditIds));
    }
    if (inviteIds.length > 0) {
      await db.delete(userInvites).where(inArray(userInvites.id, inviteIds));
    }
    if (repositoryInviteIds.length > 0) {
      await db
        .delete(repositoryInvites)
        .where(inArray(repositoryInvites.id, repositoryInviteIds));
    }
    if (accountIds.length > 0) {
      await db
        .delete(machineAccounts)
        .where(inArray(machineAccounts.id, accountIds));
    }
    if (repositoryIds.length > 0) {
      await db
        .delete(pullEvents)
        .where(inArray(pullEvents.repositoryId, repositoryIds));
      await db
        .delete(repositories)
        .where(inArray(repositories.id, repositoryIds));
    }
    if (userIds.length > 0) {
      await db.delete(users).where(inArray(users.id, userIds));
    }
    if (originalGrace === undefined) {
      delete process.env.USER_DELETE_GRACE_PERIOD_DAYS;
    } else {
      process.env.USER_DELETE_GRACE_PERIOD_DAYS = originalGrace;
    }
    await closeDb();
  });

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

  async function expire(userId: string) {
    await getDb()
      .update(users)
      .set({ deletedAt: new Date(Date.now() - 2 * DAY_MS) })
      .where(eq(users.id, userId));
  }

  it("purges an expired user who has rows in every referencing table and keeps the history", async () => {
    const db = getDb();
    const departing = await makeUser("departing");
    const survivor = await makeUser("survivor");

    const [repo] = await db
      .insert(repositories)
      .values({ name: `purge-${suffix}`, createdBy: departing })
      .returning({ id: repositories.id });
    repositoryIds.push(repo!.id);

    const [audit] = await db
      .insert(auditLog)
      .values({
        userId: departing,
        action: "auth.login",
        resource: `user:departing-${suffix}@example.test`,
      })
      .returning({ id: auditLog.id });
    auditIds.push(audit!.id);

    const [invite] = await db
      .insert(userInvites)
      .values({
        email: `invitee-${suffix}@example.test`,
        name: "Invitee",
        tokenHash: `hash-${suffix}`,
        invitedBy: departing,
        expiresAt: new Date(Date.now() + DAY_MS),
      })
      .returning({ id: userInvites.id });
    inviteIds.push(invite!.id);

    const [repoInvite] = await db
      .insert(repositoryInvites)
      .values({
        repositoryId: repo!.id,
        email: `repo-invitee-${suffix}@example.test`,
        role: "guest",
        invitedBy: departing,
      })
      .returning({ id: repositoryInvites.id });
    repositoryInviteIds.push(repoInvite!.id);

    const [pull] = await db
      .insert(pullEvents)
      .values({
        repositoryId: repo!.id,
        imageName: "app",
        digest: "sha256:abc",
        userId: departing,
      })
      .returning({ id: pullEvents.id });

    const [account] = await db
      .insert(machineAccounts)
      .values({
        ownerRepositoryId: repo!.id,
        name: `ci-${suffix}`,
        tokenPrefix: "pfx",
        tokenHash: `machine-hash-${suffix}`,
        allowPull: true,
        allowPush: false,
        createdBy: departing,
      })
      .returning({ id: machineAccounts.id });
    accountIds.push(account!.id);

    await db.insert(personalAccessTokens).values({
      userId: departing,
      name: "token",
      tokenPrefix: "pfx",
      tokenHash: `pat-hash-${suffix}`,
      allowPull: true,
      allowPush: false,
    });

    const [existingSettings] = await db
      .select({ updatedBy: systemSettings.updatedBy })
      .from(systemSettings)
      .where(eq(systemSettings.id, "default"))
      .limit(1);
    settingsRowExisted = Boolean(existingSettings);
    originalSettingsUpdatedBy = existingSettings?.updatedBy ?? null;
    await db
      .insert(systemSettings)
      .values({ id: "default", updatedBy: departing })
      .onConflictDoUpdate({
        target: systemSettings.id,
        set: { updatedBy: departing },
      });

    const departingSession = await createSession(departing);
    const survivorSession = await createSession(survivor);

    await softDeleteUser(survivor, departing);
    await expire(departing);

    await expect(purgeExpiredDeletedUsers()).resolves.toBeGreaterThanOrEqual(1);

    const remaining = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, departing));
    expect(remaining).toHaveLength(0);

    const [auditRow] = await db
      .select({ userId: auditLog.userId })
      .from(auditLog)
      .where(eq(auditLog.id, audit!.id));
    expect(auditRow).toEqual({ userId: null });

    const [repoRow] = await db
      .select({ createdBy: repositories.createdBy })
      .from(repositories)
      .where(eq(repositories.id, repo!.id));
    expect(repoRow).toEqual({ createdBy: null });

    const [inviteRow] = await db
      .select({ invitedBy: userInvites.invitedBy })
      .from(userInvites)
      .where(eq(userInvites.id, invite!.id));
    expect(inviteRow).toEqual({ invitedBy: null });

    const [repoInviteRow] = await db
      .select({ invitedBy: repositoryInvites.invitedBy })
      .from(repositoryInvites)
      .where(eq(repositoryInvites.id, repoInvite!.id));
    expect(repoInviteRow).toEqual({ invitedBy: null });

    const [pullRow] = await db
      .select({ userId: pullEvents.userId })
      .from(pullEvents)
      .where(eq(pullEvents.id, pull!.id));
    expect(pullRow).toEqual({ userId: null });

    const [accountRow] = await db
      .select({ createdBy: machineAccounts.createdBy })
      .from(machineAccounts)
      .where(eq(machineAccounts.id, account!.id));
    expect(accountRow).toEqual({ createdBy: null });

    const [settingsRow] = await db
      .select({ updatedBy: systemSettings.updatedBy })
      .from(systemSettings)
      .where(eq(systemSettings.id, "default"));
    expect(settingsRow).toEqual({ updatedBy: null });

    const listed = await listAuditLog({ page: 1, pageSize: 100 });
    const entry = listed.entries.find((item) => item.id === audit!.id);
    expect(entry?.action).toBe("auth.login");
    expect(entry?.actor.userId).toBeNull();

    expect(await getActiveSession(departingSession)).toBeNull();
    expect(await getActiveSession(survivorSession)).toMatchObject({
      id: survivor,
    });
    const departingSessions = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.userId, departing));
    expect(departingSessions).toHaveLength(0);
  });

  it("keeps session lookups working through the purge when a user has audit entries", async () => {
    const db = getDb();
    const departing = await makeUser("lookup-departing");
    const survivor = await makeUser("lookup-survivor");
    const [audit] = await db
      .insert(auditLog)
      .values({
        userId: departing,
        action: "auth.login",
        resource: `user:lookup-departing-${suffix}@example.test`,
      })
      .returning({ id: auditLog.id });
    auditIds.push(audit!.id);

    const survivorSession = await createSession(survivor);
    await db
      .update(users)
      .set({ deletedAt: new Date(Date.now() - 2 * DAY_MS) })
      .where(eq(users.id, departing));

    expect(await getActiveSession(survivorSession)).toMatchObject({
      id: survivor,
    });

    const gone = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, departing));
    expect(gone).toHaveLength(0);
  });
});
