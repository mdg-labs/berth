// Copyright (c) 2026 Michael David Guggenbichler (MDG Labs), licensed under Apache-2.0 — see LICENSE

import { randomUUID } from "node:crypto";

import { eq, inArray, or } from "drizzle-orm";
import { decodeJwt } from "jose";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  GET as adminGET,
  POST as adminPOST,
} from "@/app/api/admin/machine-accounts/route";
import {
  DELETE as adminDELETE,
  PATCH as adminPATCH,
} from "@/app/api/admin/machine-accounts/[accountId]/route";
import { GET as tokenGET } from "@/app/api/auth/token/route";
import { DELETE as repoDELETE } from "@/app/api/repositories/[id]/machine-accounts/[accountId]/route";
import {
  GET as repoGET,
  POST as repoPOST,
} from "@/app/api/repositories/[id]/machine-accounts/route";
import { closeDb, getDb } from "@/lib/db";
import { runMigrations } from "@/lib/db/migrate";
import {
  auditLog,
  machineAccountRepositories,
  machineAccounts,
  repositories,
  repositoryMembers,
  users,
} from "@/lib/db/schema";
import { hashToken } from "@/lib/email/tokens";
import { resetRateLimits } from "@/lib/rate-limit/login";
import { SESSION_COOKIE_NAME } from "@/lib/session/config";
import { createSession } from "@/lib/session/store";

const databaseUrl = process.env.DATABASE_URL;
const suffix = randomUUID().slice(0, 8);

type Actor = { id: string; cookie: string };
type Repo = { id: string; name: string };

let ipCounter = 0;

describe.skipIf(!databaseUrl)("host machine accounts against Postgres", () => {
  const userIds: string[] = [];
  const repositoryIds: string[] = [];
  const accountIds: string[] = [];
  let sysAdmin: Actor;
  let repoAdmin: Actor;
  let outsider: Actor;
  let repoA: Repo;
  let repoB: Repo;
  let repoC: Repo;

  async function makeUser(
    label: string,
    systemRole: "admin" | "user" = "user",
  ): Promise<Actor> {
    const [user] = await getDb()
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

  async function makeRepository(label: string, isPublic = false) {
    const [repo] = await getDb()
      .insert(repositories)
      .values({ name: `${label}-${suffix}`, isPublic })
      .returning({ id: repositories.id, name: repositories.name });
    repositoryIds.push(repo!.id);
    return repo!;
  }

  const adminBase = "http://localhost/api/admin/machine-accounts";
  const headers = (actor: Actor | null) => ({
    "content-type": "application/json",
    ...(actor ? { cookie: actor.cookie } : {}),
  });

  function adminCreate(actor: Actor | null, body: unknown) {
    return adminPOST(
      new NextRequest(adminBase, {
        method: "POST",
        headers: headers(actor),
        body: JSON.stringify(body),
      }),
    );
  }

  function adminList(actor: Actor | null) {
    return adminGET(new NextRequest(adminBase, { headers: headers(actor) }));
  }

  function adminPatch(actor: Actor | null, accountId: string, body: unknown) {
    return adminPATCH(
      new NextRequest(`${adminBase}/${accountId}`, {
        method: "PATCH",
        headers: headers(actor),
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ accountId }) },
    );
  }

  function adminRemove(actor: Actor | null, accountId: string) {
    return adminDELETE(
      new NextRequest(`${adminBase}/${accountId}`, {
        method: "DELETE",
        headers: headers(actor),
      }),
      { params: Promise.resolve({ accountId }) },
    );
  }

  async function createHost(
    name: string,
    repos: Repo[],
    extra: Record<string, unknown> = {},
  ) {
    const response = await adminCreate(sysAdmin, {
      name: `${name}-${suffix}`,
      repositoryIds: repos.map((repo) => repo.id),
      ...extra,
    });
    expect(response.status).toBe(201);
    const body = await response.json();
    accountIds.push(body.machineAccount.id);
    return body as {
      secret: string;
      machineAccount: {
        id: string;
        name: string;
        username: string;
        kind: string;
        repositories: Repo[];
      };
    };
  }

  async function token(secret: string, scope?: string) {
    const query = scope ? `&scope=${encodeURIComponent(scope)}` : "";
    return tokenGET(
      new NextRequest(`http://localhost/api/auth/token?service=registry${query}`, {
        headers: {
          authorization: `Basic ${Buffer.from(`whoever:${secret}`).toString("base64")}`,
          "x-forwarded-for": `198.51.100.${(++ipCounter % 250) + 1}`,
        },
      }),
    );
  }

  async function grantedAccess(secret: string, scope: string) {
    const response = await token(secret, scope);
    expect(response.status).toBe(200);
    return decodeJwt((await response.json()).token).access;
  }

  async function auditsFor(accountId: string) {
    return getDb()
      .select()
      .from(auditLog)
      .where(eq(auditLog.resource, `machine_account:${accountId}`));
  }

  beforeAll(async () => {
    await runMigrations();
    sysAdmin = await makeUser("hostadmin", "admin");
    repoAdmin = await makeUser("hostrepoadmin");
    outsider = await makeUser("hostoutsider");
    repoA = await makeRepository("hosta");
    repoB = await makeRepository("hostb");
    repoC = await makeRepository("hostc");
    await getDb()
      .insert(repositoryMembers)
      .values({ repositoryId: repoA.id, userId: repoAdmin.id, role: "admin" });
  });

  beforeEach(() => {
    resetRateLimits();
  });

  afterAll(async () => {
    const db = getDb();
    if (accountIds.length > 0) {
      await db.delete(machineAccounts).where(inArray(machineAccounts.id, accountIds));
    }
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

  it("answers 401 without a session and 403 for a signed-in non-admin on every route", async () => {
    const existing = await createHost("authz", [repoA]);
    const id = existing.machineAccount.id;
    const calls = (actor: Actor | null) => [
      () => adminList(actor),
      () =>
        adminCreate(actor, {
          name: `denied-${suffix}`,
          repositoryIds: [repoA.id],
        }),
      () => adminPatch(actor, id, { description: "x" }),
      () => adminRemove(actor, id),
    ];

    for (const call of calls(null)) {
      expect((await call()).status).toBe(401);
    }
    for (const actor of [repoAdmin, outsider]) {
      for (const call of calls(actor)) {
        expect((await call()).status).toBe(403);
      }
    }

    const [row] = await getDb()
      .select()
      .from(machineAccounts)
      .where(eq(machineAccounts.id, id));
    expect(row!.description).toBeNull();
    expect(
      (await getDb().select().from(machineAccounts).where(eq(machineAccounts.name, `denied-${suffix}`))),
    ).toHaveLength(0);
  });

  it("creates a host account, returns the secret once and stores only the hash", async () => {
    const response = await adminCreate(sysAdmin, {
      name: `Deploy-${suffix}`,
      description: " prod hosts ",
      repositoryIds: [repoB.id, repoA.id, repoA.id],
    });
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    accountIds.push(body.machineAccount.id);

    expect(body.secret).toMatch(/^bm_[A-Za-z0-9_-]{43}$/);
    expect(body.machineAccount).toMatchObject({
      kind: "host",
      name: `deploy-${suffix}`,
      description: "prod hosts",
      username: `host+deploy-${suffix}`,
      allowPull: true,
      allowPush: false,
      createdBy: { id: sysAdmin.id },
      repositories: [repoA, repoB],
    });
    expect(body.machineAccount).not.toHaveProperty("secret");

    const [row] = await getDb()
      .select()
      .from(machineAccounts)
      .where(eq(machineAccounts.id, body.machineAccount.id));
    expect(row!.ownerRepositoryId).toBeNull();
    expect(row!.tokenHash).toBe(hashToken(body.secret));

    const listed = await getDb()
      .select()
      .from(machineAccountRepositories)
      .where(eq(machineAccountRepositories.machineAccountId, row!.id));
    expect(listed.map((entry) => entry.repositoryId).sort()).toEqual(
      [repoA.id, repoB.id].sort(),
    );

    const audits = await auditsFor(row!.id);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      action: "machine_account.create",
      userId: sysAdmin.id,
      repositoryId: null,
      metadata: {
        name: row!.name,
        kind: "host",
        allowPull: true,
        allowPush: false,
        repositoryIds: [repoA.id, repoB.id].sort(),
      },
    });
    expect(JSON.stringify(audits)).not.toContain(body.secret);
    expect(JSON.stringify(audits)).not.toContain(row!.tokenHash);
  });

  it("rejects invalid creates and writes nothing", async () => {
    const unknownRepository = randomUUID();
    const before = await getDb().select({ id: machineAccounts.id }).from(machineAccounts);
    const auditBefore = await getDb().select({ id: auditLog.id }).from(auditLog);

    for (const [body, status] of [
      [{ name: `x1-${suffix}`, repositoryIds: [unknownRepository] }, 400],
      [{ name: `x2-${suffix}`, repositoryIds: [repoA.id, unknownRepository] }, 400],
      [{ name: `x3-${suffix}`, repositoryIds: [] }, 400],
      [{ name: `x4-${suffix}` }, 400],
      [{ name: `x5-${suffix}`, repositoryIds: ["not-a-uuid"] }, 400],
      [{ name: `x6-${suffix}`, repositoryIds: [repoA.id], allowPush: true }, 400],
      [{ name: `x7-${suffix}`, repositoryIds: [repoA.id], allowPull: false }, 400],
      [{ name: "A", repositoryIds: [repoA.id] }, 400],
    ] as const) {
      expect((await adminCreate(sysAdmin, body)).status).toBe(status);
    }

    expect(
      await getDb().select({ id: machineAccounts.id }).from(machineAccounts),
    ).toHaveLength(before.length);
    expect(await getDb().select({ id: auditLog.id }).from(auditLog)).toHaveLength(
      auditBefore.length,
    );
  });

  it("rejects a duplicate host name with 409, also under concurrency, but allows the name on a repository", async () => {
    await createHost("dup", [repoA]);
    const again = await adminCreate(sysAdmin, {
      name: `dup-${suffix}`,
      repositoryIds: [repoB.id],
    });
    expect(again.status).toBe(409);
    expect((await again.json()).error.code).toBe("conflict");

    const statuses = (
      await Promise.all([
        adminCreate(sysAdmin, { name: `race-${suffix}`, repositoryIds: [repoA.id] }),
        adminCreate(sysAdmin, { name: `race-${suffix}`, repositoryIds: [repoA.id] }),
      ])
    )
      .map((response) => response.status)
      .sort();
    expect(statuses).toEqual([201, 409]);
    const racing = await getDb()
      .select({ id: machineAccounts.id })
      .from(machineAccounts)
      .where(eq(machineAccounts.name, `race-${suffix}`));
    accountIds.push(...racing.map((entry) => entry.id));
    expect(racing).toHaveLength(1);

    const sameNameOnRepository = await repoPOST(
      new NextRequest(`http://localhost/api/repositories/${repoA.id}/machine-accounts`, {
        method: "POST",
        headers: headers(repoAdmin),
        body: JSON.stringify({ name: `dup-${suffix}`, allowPull: true }),
      }),
      { params: Promise.resolve({ id: repoA.id }) },
    );
    expect(sameNameOnRepository.status).toBe(201);
    accountIds.push((await sameNameOnRepository.json()).machineAccount.id);
  });

  it("lists both kinds without a secret or hash", async () => {
    const host = await createHost("listing", [repoA, repoB]);
    const repoAccountResponse = await repoPOST(
      new NextRequest(`http://localhost/api/repositories/${repoA.id}/machine-accounts`, {
        method: "POST",
        headers: headers(repoAdmin),
        body: JSON.stringify({ name: `ownlist-${suffix}`, allowPush: true }),
      }),
      { params: Promise.resolve({ id: repoA.id }) },
    );
    const repoAccount = await repoAccountResponse.json();
    accountIds.push(repoAccount.machineAccount.id);

    const response = await adminList(sysAdmin);
    expect(response.status).toBe(200);
    const text = JSON.stringify(await (response.clone()).json());
    expect(text).not.toContain(host.secret);
    expect(text).not.toContain(hashToken(host.secret));
    expect(text).not.toContain(repoAccount.secret);
    expect(text).not.toContain("tokenHash");

    const { machineAccounts: all } = await response.json();
    const hostEntry = all.find((entry: { id: string }) => entry.id === host.machineAccount.id);
    const ownEntry = all.find(
      (entry: { id: string }) => entry.id === repoAccount.machineAccount.id,
    );
    expect(hostEntry).toMatchObject({
      kind: "host",
      username: `host+listing-${suffix}`,
      repositories: [repoA, repoB],
      allowPull: true,
      allowPush: false,
      createdBy: { id: sysAdmin.id },
    });
    expect(ownEntry).toMatchObject({
      kind: "repository",
      username: `${repoA.name}+ownlist-${suffix}`,
      repositories: [repoA],
      allowPush: true,
    });
  });

  it("grants pull on listed repositories only, never push, never an unlisted private one", async () => {
    const host = await createHost("tokens", [repoA, repoB]);

    expect(
      await grantedAccess(
        host.secret,
        `repository:${repoA.name}/x:pull repository:${repoB.name}/y:pull`,
      ),
    ).toEqual([
      { type: "repository", name: `${repoA.name}/x`, actions: ["pull"] },
      { type: "repository", name: `${repoB.name}/y`, actions: ["pull"] },
    ]);
    expect(
      await grantedAccess(host.secret, `repository:${repoA.name}/x:pull,push,delete`),
    ).toEqual([{ type: "repository", name: `${repoA.name}/x`, actions: ["pull"] }]);
    expect(
      (await token(host.secret, `repository:${repoA.name}/x:push`)).status,
    ).toBe(403);
    expect(
      (await token(host.secret, `repository:${repoC.name}/z:pull`)).status,
    ).toBe(403);
  });

  it("keeps the same secret valid after PATCH adds a repository and records the change", async () => {
    const host = await createHost("patch", [repoA]);
    const id = host.machineAccount.id;
    expect(
      (await token(host.secret, `repository:${repoC.name}/z:pull`)).status,
    ).toBe(403);

    const response = await adminPatch(sysAdmin, id, {
      repositoryIds: [repoC.id, repoA.id],
      description: "now with c",
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).not.toHaveProperty("secret");
    expect(body.machineAccount).toMatchObject({
      id,
      kind: "host",
      description: "now with c",
      repositories: [repoA, repoC],
    });

    expect(
      await grantedAccess(host.secret, `repository:${repoC.name}/z:pull`),
    ).toEqual([{ type: "repository", name: `${repoC.name}/z`, actions: ["pull"] }]);

    const update = (await auditsFor(id)).find(
      (entry) => entry.action === "machine_account.update",
    );
    expect(update).toMatchObject({
      userId: sysAdmin.id,
      repositoryId: null,
      metadata: {
        name: host.machineAccount.name,
        kind: "host",
        repositoryIds: {
          before: [repoA.id],
          after: [repoA.id, repoC.id].sort(),
        },
        descriptionChanged: true,
      },
    });

    const replaced = await adminPatch(sysAdmin, id, { repositoryIds: [repoB.id] });
    expect((await replaced.json()).machineAccount.repositories).toEqual([repoB]);
    expect(
      (await token(host.secret, `repository:${repoA.name}/x:pull`)).status,
    ).toBe(403);
  });

  it("rejects invalid patches without changing the list", async () => {
    const host = await createHost("badpatch", [repoA, repoB]);
    const id = host.machineAccount.id;

    for (const body of [
      {},
      { repositoryIds: [] },
      { repositoryIds: [repoC.id, randomUUID()] },
      { repositoryIds: "x" },
      { description: 1 },
    ]) {
      expect((await adminPatch(sysAdmin, id, body)).status).toBe(400);
    }
    expect((await adminPatch(sysAdmin, randomUUID(), { description: "x" })).status).toBe(404);
    expect((await adminPatch(sysAdmin, "not-a-uuid", { description: "x" })).status).toBe(404);

    const kept = await getDb()
      .select()
      .from(machineAccountRepositories)
      .where(eq(machineAccountRepositories.machineAccountId, id));
    expect(kept.map((entry) => entry.repositoryId).sort()).toEqual(
      [repoA.id, repoB.id].sort(),
    );
    expect(
      (await auditsFor(id)).filter((entry) => entry.action === "machine_account.update"),
    ).toHaveLength(0);
  });

  it("returns 400 when patching a repository account and leaves it unchanged", async () => {
    const created = await (
      await repoPOST(
        new NextRequest(`http://localhost/api/repositories/${repoA.id}/machine-accounts`, {
          method: "POST",
          headers: headers(repoAdmin),
          body: JSON.stringify({ name: `own-${suffix}`, allowPull: true }),
        }),
        { params: Promise.resolve({ id: repoA.id }) },
      )
    ).json();
    const id = created.machineAccount.id as string;
    accountIds.push(id);

    const response = await adminPatch(sysAdmin, id, { repositoryIds: [repoB.id] });
    expect(response.status).toBe(400);
    expect(
      await getDb()
        .select()
        .from(machineAccountRepositories)
        .where(eq(machineAccountRepositories.machineAccountId, id)),
    ).toHaveLength(0);
    const [row] = await getDb().select().from(machineAccounts).where(eq(machineAccounts.id, id));
    expect(row!.ownerRepositoryId).toBe(repoA.id);
  });

  it("keeps pulling from the remaining repository after one is deleted, and from nothing private after all are", async () => {
    const a = await makeRepository("hostgone-a");
    const b = await makeRepository("hostgone-b");
    const host = await createHost("gone", [a, b]);

    await getDb().delete(repositories).where(eq(repositories.id, b.id));
    expect(
      await grantedAccess(host.secret, `repository:${a.name}/x:pull`),
    ).toEqual([{ type: "repository", name: `${a.name}/x`, actions: ["pull"] }]);

    await getDb().delete(repositories).where(eq(repositories.id, a.id));
    const privateRepo = await makeRepository("hostgone-private");
    expect(
      (await token(host.secret, `repository:${privateRepo.name}/x:pull`)).status,
    ).toBe(403);
    expect(
      (await token(host.secret, `repository:${repoA.name}/x:pull`)).status,
    ).toBe(403);
    expect(decodeJwt((await (await token(host.secret)).json()).token).access).toEqual([]);

    const [row] = await getDb()
      .select()
      .from(machineAccounts)
      .where(eq(machineAccounts.id, host.machineAccount.id));
    expect(row).toBeDefined();
  });

  it("shows host accounts read-only in the repository view and refuses repository-level deletion", async () => {
    const host = await createHost("visible", [repoA, repoB]);
    const id = host.machineAccount.id;

    const response = await repoGET(
      new NextRequest(`http://localhost/api/repositories/${repoA.id}/machine-accounts`, {
        headers: headers(repoAdmin),
      }),
      { params: Promise.resolve({ id: repoA.id }) },
    );
    expect(response.status).toBe(200);
    const text = JSON.stringify(await response.clone().json());
    expect(text).not.toContain(host.secret);
    expect(text).not.toContain(repoB.name);
    const { machineAccounts: listed } = await response.json();
    expect(listed.find((entry: { id: string }) => entry.id === id)).toMatchObject({
      kind: "host",
      username: `host+visible-${suffix}`,
      repositories: [repoA],
    });

    const otherView = await repoGET(
      new NextRequest(`http://localhost/api/repositories/${repoC.id}/machine-accounts`, {
        headers: headers(sysAdmin),
      }),
      { params: Promise.resolve({ id: repoC.id }) },
    );
    expect(
      (await otherView.json()).machineAccounts.some((entry: { id: string }) => entry.id === id),
    ).toBe(false);

    for (const actor of [repoAdmin, sysAdmin]) {
      const removed = await repoDELETE(
        new NextRequest(
          `http://localhost/api/repositories/${repoA.id}/machine-accounts/${id}`,
          { method: "DELETE", headers: headers(actor) },
        ),
        { params: Promise.resolve({ id: repoA.id, accountId: id }) },
      );
      expect(removed.status).toBe(404);
    }
    expect(
      await getDb().select().from(machineAccounts).where(eq(machineAccounts.id, id)),
    ).toHaveLength(1);
  });

  it("deletes either kind through the admin route, audits it and stops the secret working", async () => {
    const host = await createHost("removed", [repoA, repoB]);
    const hostId = host.machineAccount.id;

    const ownResponse = await repoPOST(
      new NextRequest(`http://localhost/api/repositories/${repoA.id}/machine-accounts`, {
        method: "POST",
        headers: headers(repoAdmin),
        body: JSON.stringify({ name: `ownrm-${suffix}`, allowPull: true }),
      }),
      { params: Promise.resolve({ id: repoA.id }) },
    );
    const own = await ownResponse.json();
    const ownId = own.machineAccount.id as string;

    expect((await adminRemove(sysAdmin, hostId)).status).toBe(200);
    expect((await adminRemove(sysAdmin, ownId)).status).toBe(200);
    expect((await adminRemove(sysAdmin, hostId)).status).toBe(404);
    expect((await adminRemove(sysAdmin, "not-a-uuid")).status).toBe(404);

    expect(
      await getDb()
        .select()
        .from(machineAccountRepositories)
        .where(eq(machineAccountRepositories.machineAccountId, hostId)),
    ).toHaveLength(0);
    expect(
      (await token(host.secret, `repository:${repoA.name}/x:pull`)).status,
    ).toBe(401);
    expect((await token(own.secret)).status).toBe(401);

    const hostAudit = (await auditsFor(hostId)).find(
      (entry) => entry.action === "machine_account.delete",
    );
    expect(hostAudit).toMatchObject({
      userId: sysAdmin.id,
      repositoryId: null,
      metadata: {
        name: host.machineAccount.name,
        kind: "host",
        allowPush: false,
        repositoryIds: [repoA.id, repoB.id].sort(),
      },
    });
    const ownAudit = (await auditsFor(ownId)).find(
      (entry) => entry.action === "machine_account.delete",
    );
    expect(ownAudit).toMatchObject({
      userId: sysAdmin.id,
      repositoryId: repoA.id,
      metadata: { kind: "repository" },
    });
  });
});
