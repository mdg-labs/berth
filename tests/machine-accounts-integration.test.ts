// Copyright (c) 2026 Michael David Guggenbichler (MDG Labs), licensed under Apache-2.0 — see LICENSE

import { randomUUID } from "node:crypto";

import { eq, inArray, or } from "drizzle-orm";
import { decodeJwt } from "jose";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GET as tokenGET } from "@/app/api/auth/token/route";
import { DELETE } from "@/app/api/repositories/[id]/machine-accounts/[accountId]/route";
import {
  GET,
  POST,
} from "@/app/api/repositories/[id]/machine-accounts/route";
import { closeDb, getDb } from "@/lib/db";
import { runMigrations } from "@/lib/db/migrate";
import {
  auditLog,
  machineAccounts,
  repositories,
  repositoryMembers,
  users,
} from "@/lib/db/schema";
import { hashToken } from "@/lib/email/tokens";
import { createSession } from "@/lib/session/store";
import { SESSION_COOKIE_NAME } from "@/lib/session/config";
import { hardDeleteUser } from "@/lib/users/lifecycle";

const databaseUrl = process.env.DATABASE_URL;
const suffix = randomUUID().slice(0, 8);

type Actor = { id: string; cookie: string };

describe.skipIf(!databaseUrl)("machine accounts against Postgres", () => {
  const userIds: string[] = [];
  const repositoryIds: string[] = [];
  let sysAdmin: Actor;
  let repoAdmin: Actor;
  let maintainer: Actor;
  let outsider: Actor;
  let repoA: { id: string; name: string };
  let repoB: { id: string; name: string };

  async function makeUser(
    label: string,
    systemRole: "admin" | "user" = "user",
  ): Promise<Actor> {
    const db = getDb();
    const [user] = await db
      .insert(users)
      .values({
        email: `${label}-${suffix}@example.test`,
        name: `${label} ${suffix}`,
        systemRole,
      })
      .returning({ id: users.id });
    userIds.push(user!.id);
    const sessionId = await createSession(user!.id);
    return { id: user!.id, cookie: `${SESSION_COOKIE_NAME}=${sessionId}` };
  }

  async function makeRepository(label: string) {
    const [repo] = await getDb()
      .insert(repositories)
      .values({ name: `${label}-${suffix}` })
      .returning({ id: repositories.id, name: repositories.name });
    repositoryIds.push(repo!.id);
    return repo!;
  }

  const base = (repositoryId: string) =>
    `http://localhost/api/repositories/${repositoryId}/machine-accounts`;

  function create(actor: Actor | null, repositoryId: string, body: unknown) {
    return POST(
      new NextRequest(base(repositoryId), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(actor ? { cookie: actor.cookie } : {}),
        },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id: repositoryId }) },
    );
  }

  function list(actor: Actor | null, repositoryId: string) {
    return GET(
      new NextRequest(base(repositoryId), {
        headers: actor ? { cookie: actor.cookie } : {},
      }),
      { params: Promise.resolve({ id: repositoryId }) },
    );
  }

  function remove(
    actor: Actor | null,
    repositoryId: string,
    accountId: string,
  ) {
    return DELETE(
      new NextRequest(`${base(repositoryId)}/${accountId}`, {
        method: "DELETE",
        headers: actor ? { cookie: actor.cookie } : {},
      }),
      { params: Promise.resolve({ id: repositoryId, accountId }) },
    );
  }

  async function accountRows(repositoryId: string) {
    return getDb()
      .select()
      .from(machineAccounts)
      .where(eq(machineAccounts.ownerRepositoryId, repositoryId));
  }

  beforeAll(async () => {
    await runMigrations();
    sysAdmin = await makeUser("sysadmin", "admin");
    repoAdmin = await makeUser("repoadmin");
    maintainer = await makeUser("maintainer");
    outsider = await makeUser("outsider");
    repoA = await makeRepository("alpha");
    repoB = await makeRepository("bravo");
    await getDb()
      .insert(repositoryMembers)
      .values([
        { repositoryId: repoA.id, userId: repoAdmin.id, role: "admin" },
        { repositoryId: repoA.id, userId: maintainer.id, role: "maintainer" },
        { repositoryId: repoB.id, userId: repoAdmin.id, role: "maintainer" },
      ]);
  });

  afterAll(async () => {
    const db = getDb();
    await db
      .delete(auditLog)
      .where(
        or(
          inArray(auditLog.userId, userIds),
          inArray(auditLog.repositoryId, repositoryIds),
        ),
      );
    await db.delete(repositories).where(inArray(repositories.id, repositoryIds));
    await db.delete(users).where(inArray(users.id, userIds));
    await closeDb();
  });

  it("creates an account, stores only the hash and audits without the secret", async () => {
    const response = await create(repoAdmin, repoA.id, {
      name: "ci",
      description: "CI pulls",
      allowPull: true,
      allowPush: false,
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.secret).toMatch(/^bm_[A-Za-z0-9_-]{43}$/);
    expect(body.machineAccount).toMatchObject({
      name: "ci",
      description: "CI pulls",
      username: `${repoA.name}+ci`,
      allowPull: true,
      allowPush: false,
      createdBy: { id: repoAdmin.id },
    });
    expect(body.machineAccount).not.toHaveProperty("secret");

    const [row] = await accountRows(repoA.id);
    expect(row!.tokenHash).toBe(hashToken(body.secret));
    expect(row!.tokenHash).not.toContain(body.secret);
    expect(row!.tokenPrefix).toBe(body.secret.slice(0, 12));
    expect(row!.createdBy).toBe(repoAdmin.id);

    const audits = await getDb()
      .select()
      .from(auditLog)
      .where(eq(auditLog.resource, `machine_account:${row!.id}`));
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      action: "machine_account.create",
      userId: repoAdmin.id,
      repositoryId: repoA.id,
      metadata: { name: "ci", allowPull: true, allowPush: false },
    });
    expect(JSON.stringify(audits[0])).not.toContain(body.secret);
    expect(JSON.stringify(audits[0])).not.toContain(row!.tokenHash);
  });

  it("lists summaries without secret or hash and follows a repository rename", async () => {
    const created = await (
      await create(sysAdmin, repoA.id, { name: "lister", allowPush: true })
    ).json();

    const first = await list(repoAdmin, repoA.id);
    expect(first.status).toBe(200);
    const text = JSON.stringify(await first.json());
    expect(text).not.toContain(created.secret);
    expect(text).not.toContain(hashToken(created.secret));
    expect(text).not.toContain("token_hash");
    expect(text).not.toContain("tokenHash");

    const renamed = `${repoA.name}-renamed`;
    await getDb()
      .update(repositories)
      .set({ name: renamed })
      .where(eq(repositories.id, repoA.id));
    try {
      const second = await (await list(repoAdmin, repoA.id)).json();
      const usernames = second.machineAccounts.map(
        (account: { username: string }) => account.username,
      );
      expect(usernames).toContain(`${renamed}+lister`);
    } finally {
      await getDb()
        .update(repositories)
        .set({ name: repoA.name })
        .where(eq(repositories.id, repoA.id));
    }
  });

  it("rejects a duplicate name in the same repository, also under concurrency", async () => {
    expect(
      (await create(repoAdmin, repoA.id, { name: "dup", allowPull: true })).status,
    ).toBe(201);
    const again = await create(repoAdmin, repoA.id, {
      name: "dup",
      allowPull: true,
    });
    expect(again.status).toBe(409);
    expect((await again.json()).error.code).toBe("conflict");

    const statuses = (
      await Promise.all([
        create(sysAdmin, repoB.id, { name: "race", allowPull: true }),
        create(sysAdmin, repoB.id, { name: "race", allowPull: true }),
      ])
    )
      .map((response) => response.status)
      .sort();
    expect(statuses).toEqual([201, 409]);
    expect(await accountRows(repoB.id)).toHaveLength(1);

    const sameNameElsewhere = await create(sysAdmin, repoB.id, {
      name: "dup",
      allowPull: true,
    });
    expect(sameNameElsewhere.status).toBe(201);
  });

  it("denies maintainers and non-members and leaves no row or audit entry", async () => {
    const before = await accountRows(repoA.id);
    const auditBefore = await getDb()
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(eq(auditLog.repositoryId, repoA.id));

    for (const actor of [maintainer, outsider]) {
      expect((await list(actor, repoA.id)).status).toBe(403);
      expect(
        (await create(actor, repoA.id, { name: "denied", allowPull: true })).status,
      ).toBe(403);
      expect((await remove(actor, repoA.id, before[0]!.id)).status).toBe(403);
    }

    expect(await accountRows(repoA.id)).toHaveLength(before.length);
    const auditAfter = await getDb()
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(eq(auditLog.repositoryId, repoA.id));
    expect(auditAfter).toHaveLength(auditBefore.length);
  });

  it("returns 401 without a session and 404 for an unknown repository", async () => {
    expect((await list(null, repoA.id)).status).toBe(401);
    expect(
      (await create(null, repoA.id, { name: "anon", allowPull: true })).status,
    ).toBe(401);
    expect((await remove(null, repoA.id, randomUUID())).status).toBe(401);

    const unknown = randomUUID();
    expect((await list(sysAdmin, unknown)).status).toBe(404);
    expect(
      (await create(sysAdmin, unknown, { name: "x1", allowPull: true })).status,
    ).toBe(404);
    expect((await remove(sysAdmin, unknown, randomUUID())).status).toBe(404);
  });

  it("deletes only inside the repository named in the path and audits it", async () => {
    const created = await (
      await create(repoAdmin, repoA.id, { name: "victim", allowPull: true })
    ).json();
    const accountId = created.machineAccount.id as string;

    const crossRepo = await remove(sysAdmin, repoB.id, accountId);
    expect(crossRepo.status).toBe(404);
    expect(
      (await accountRows(repoA.id)).some((row) => row.id === accountId),
    ).toBe(true);

    const deleted = await remove(repoAdmin, repoA.id, accountId);
    expect(deleted.status).toBe(200);
    expect(
      (await accountRows(repoA.id)).some((row) => row.id === accountId),
    ).toBe(false);
    expect((await remove(repoAdmin, repoA.id, accountId)).status).toBe(404);

    const audits = await getDb()
      .select()
      .from(auditLog)
      .where(eq(auditLog.resource, `machine_account:${accountId}`));
    const deleteAudit = audits.find(
      (entry) => entry.action === "machine_account.delete",
    );
    expect(deleteAudit).toMatchObject({
      userId: repoAdmin.id,
      repositoryId: repoA.id,
      metadata: { name: "victim", allowPull: true, allowPush: false },
    });
    expect(JSON.stringify(audits)).not.toContain(created.secret);
  });

  it("rejects a non-uuid account id with 404", async () => {
    expect((await remove(sysAdmin, repoA.id, "not-a-uuid")).status).toBe(404);
  });

  it("deletes the accounts with their repository", async () => {
    const repo = await makeRepository("doomed");
    await create(sysAdmin, repo.id, { name: "one", allowPull: true });
    expect(await accountRows(repo.id)).toHaveLength(1);

    await getDb().delete(repositories).where(eq(repositories.id, repo.id));

    expect(await accountRows(repo.id)).toHaveLength(0);
  });

  it("keeps the account with created_by null when its creator is hard-deleted", async () => {
    const creator = await makeUser("creator");
    const [account] = await getDb()
      .insert(machineAccounts)
      .values({
        ownerRepositoryId: repoB.id,
        name: `orphan-${suffix}`,
        tokenPrefix: "bm_orphan",
        tokenHash: hashToken(`orphan-${suffix}`),
        allowPull: true,
        allowPush: false,
        createdBy: creator.id,
      })
      .returning({ id: machineAccounts.id });

    await hardDeleteUser(creator.id);
    userIds.splice(userIds.indexOf(creator.id), 1);

    const [after] = await getDb()
      .select()
      .from(machineAccounts)
      .where(eq(machineAccounts.id, account!.id));
    expect(after).toBeDefined();
    expect(after!.createdBy).toBeNull();

    const body = await (await list(sysAdmin, repoB.id)).json();
    const listed = body.machineAccounts.find(
      (entry: { id: string }) => entry.id === account!.id,
    );
    expect(listed.createdBy).toBeNull();
  });

  it("accepts the secret at the token endpoint only as a machine secret", async () => {
    const created = await (
      await create(repoAdmin, repoA.id, { name: "docker", allowPull: true })
    ).json();
    const basic = Buffer.from(
      `${created.machineAccount.username}:${created.secret}`,
    ).toString("base64");

    const login = await tokenGET(
      new NextRequest("http://localhost/api/auth/token?service=registry", {
        headers: { authorization: `Basic ${basic}` },
      }),
    );
    expect(login.status).toBe(200);
    expect(decodeJwt((await login.json()).token).sub).toBe(
      `machine:${created.machineAccount.id}`,
    );

    const scoped = await tokenGET(
      new NextRequest(
        `http://localhost/api/auth/token?service=registry&scope=repository:${repoA.name}/app:pull`,
        { headers: { authorization: `Basic ${basic}` } },
      ),
    );
    expect(scoped.status).toBe(200);

    const otherRepository = await tokenGET(
      new NextRequest(
        `http://localhost/api/auth/token?service=registry&scope=repository:${repoB.name}/app:pull`,
        { headers: { authorization: `Basic ${basic}` } },
      ),
    );
    expect(otherRepository.status).toBe(403);
  });
});
