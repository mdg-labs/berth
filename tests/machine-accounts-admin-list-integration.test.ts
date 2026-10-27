// Copyright (c) 2026 Michael David Guggenbichler (MDG Labs), licensed under Apache-2.0 — see LICENSE

import { randomUUID } from "node:crypto";

import { eq, inArray, or } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  GET as adminGET,
  POST as adminPOST,
} from "@/app/api/admin/machine-accounts/route";
import {
  DELETE as adminDELETE,
  PATCH as adminPATCH,
} from "@/app/api/admin/machine-accounts/[accountId]/route";
import {
  PATCH as repoPATCH,
} from "@/app/api/repositories/[id]/machine-accounts/[accountId]/route";
import { POST as repoPOST } from "@/app/api/repositories/[id]/machine-accounts/route";
import { closeDb, getDb } from "@/lib/db";
import { runMigrations } from "@/lib/db/migrate";
import {
  auditLog,
  machineAccounts,
  repositories,
  users,
} from "@/lib/db/schema";
import { SESSION_COOKIE_NAME } from "@/lib/session/config";
import { createSession } from "@/lib/session/store";

const databaseUrl = process.env.DATABASE_URL;
const suffix = randomUUID().slice(0, 8);
const BASE = "http://localhost/api/admin/machine-accounts";

type Actor = { id: string; cookie: string };
type Repo = { id: string; name: string };
type Listed = {
  id: string;
  name: string;
  kind: string;
  status: string;
  repositories: Repo[];
};

describe.skipIf(!databaseUrl)("admin machine account list against Postgres", () => {
  const userIds: string[] = [];
  const repositoryIds: string[] = [];
  const accountIds: string[] = [];
  let sysAdmin: Actor;
  let regular: Actor;
  let repoA: Repo;
  let repoB: Repo;
  let repoC: Repo;
  const ids: Record<string, string> = {};

  async function makeUser(label: string, systemRole: "admin" | "user") {
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

  async function makeRepository(label: string) {
    const [repo] = await getDb()
      .insert(repositories)
      .values({ name: `${label}-${suffix}` })
      .returning({ id: repositories.id, name: repositories.name });
    repositoryIds.push(repo!.id);
    return repo!;
  }

  const headers = (actor: Actor | null) => ({
    "content-type": "application/json",
    ...(actor ? { cookie: actor.cookie } : {}),
  });

  function list(actor: Actor | null, query = "") {
    return adminGET(new NextRequest(`${BASE}${query}`, { headers: headers(actor) }));
  }

  async function listedNames(query: string) {
    const response = await list(sysAdmin, query);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { machineAccounts: Listed[] };
    return body.machineAccounts
      .filter((account) => account.name.endsWith(`-${suffix}`))
      .map((account) => account.name.replace(`-${suffix}`, ""))
      .sort();
  }

  async function createRepositoryAccount(repo: Repo, name: string) {
    const response = await repoPOST(
      new NextRequest(`http://localhost/api/repositories/${repo.id}/machine-accounts`, {
        method: "POST",
        headers: headers(sysAdmin),
        body: JSON.stringify({ name: `${name}-${suffix}`, allowPull: true }),
      }),
      { params: Promise.resolve({ id: repo.id }) },
    );
    expect(response.status).toBe(201);
    const id = (await response.json()).machineAccount.id as string;
    accountIds.push(id);
    ids[name] = id;
  }

  async function createHostAccount(name: string, repos: Repo[]) {
    const response = await adminPOST(
      new NextRequest(BASE, {
        method: "POST",
        headers: headers(sysAdmin),
        body: JSON.stringify({
          name: `${name}-${suffix}`,
          repositoryIds: repos.map((repo) => repo.id),
        }),
      }),
    );
    expect(response.status).toBe(201);
    const id = (await response.json()).machineAccount.id as string;
    accountIds.push(id);
    ids[name] = id;
  }

  async function auditsFor(accountId: string) {
    return getDb()
      .select()
      .from(auditLog)
      .where(eq(auditLog.resource, `machine_account:${accountId}`));
  }

  beforeAll(async () => {
    await runMigrations();
    sysAdmin = await makeUser("listadmin", "admin");
    regular = await makeUser("listuser", "user");
    repoA = await makeRepository("lista");
    repoB = await makeRepository("listb");
    repoC = await makeRepository("listc");

    await createRepositoryAccount(repoA, "own-active");
    await createRepositoryAccount(repoB, "own-disabled");
    await createRepositoryAccount(repoA, "own-expired");
    await createHostAccount("host-active", [repoA, repoB]);
    await createHostAccount("host-only-c", [repoC]);
    await createHostAccount("host-expired", [repoB]);

    const db = getDb();
    await db
      .update(machineAccounts)
      .set({ disabledAt: new Date() })
      .where(eq(machineAccounts.id, ids["own-disabled"]!));
    await db
      .update(machineAccounts)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(inArray(machineAccounts.id, [ids["own-expired"]!, ids["host-expired"]!]));
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

  it("answers 401 without a session and 403 for a non-admin", async () => {
    expect((await list(null)).status).toBe(401);
    expect((await list(regular)).status).toBe(403);
  });

  it("returns status, expiry and last used for accounts of both kinds", async () => {
    const response = await list(sysAdmin);
    const body = (await response.json()) as {
      machineAccounts: Array<Listed & { expiresAt: string | null; lastUsedAt: string | null }>;
    };
    const byName = new Map(
      body.machineAccounts.map((account) => [account.name, account]),
    );

    expect(byName.get(`own-active-${suffix}`)).toMatchObject({
      kind: "repository",
      status: "active",
      expiresAt: null,
      lastUsedAt: null,
    });
    expect(byName.get(`own-disabled-${suffix}`)?.status).toBe("disabled");
    expect(byName.get(`own-expired-${suffix}`)?.status).toBe("expired");
    expect(byName.get(`host-active-${suffix}`)).toMatchObject({
      kind: "host",
      status: "active",
    });
    expect(
      byName.get(`host-active-${suffix}`)?.repositories.map((repo) => repo.name),
    ).toEqual([repoA.name, repoB.name]);
  });

  it("filters by kind", async () => {
    expect(await listedNames("?kind=host")).toEqual([
      "host-active",
      "host-expired",
      "host-only-c",
    ]);
    expect(await listedNames("?kind=repository")).toEqual([
      "own-active",
      "own-disabled",
      "own-expired",
    ]);
  });

  it("filters by status", async () => {
    expect(await listedNames("?status=disabled")).toEqual(["own-disabled"]);
    expect(await listedNames("?status=expired")).toEqual([
      "host-expired",
      "own-expired",
    ]);
    expect(await listedNames("?status=active")).toEqual([
      "host-active",
      "host-only-c",
      "own-active",
    ]);
  });

  it("filters by owner repository or by a repository a host account lists", async () => {
    expect(await listedNames(`?repositoryId=${repoA.id}`)).toEqual([
      "host-active",
      "own-active",
      "own-expired",
    ]);
    expect(await listedNames(`?repositoryId=${repoC.id}`)).toEqual([
      "host-only-c",
    ]);
  });

  it("combines the filters", async () => {
    expect(
      await listedNames(`?repositoryId=${repoB.id}&kind=host&status=expired`),
    ).toEqual(["host-expired"]);
    expect(
      await listedNames(`?repositoryId=${repoC.id}&status=expired`),
    ).toEqual([]);
  });

  it("lets a system admin disable, enable and delete accounts of both kinds, audited with the admin as actor", async () => {
    const ownId = ids["own-active"]!;
    const hostId = ids["host-active"]!;

    const disableOwn = await repoPATCH(
      new NextRequest(
        `http://localhost/api/repositories/${repoA.id}/machine-accounts/${ownId}`,
        {
          method: "PATCH",
          headers: headers(sysAdmin),
          body: JSON.stringify({ disabled: true }),
        },
      ),
      { params: Promise.resolve({ id: repoA.id, accountId: ownId }) },
    );
    expect(disableOwn.status).toBe(200);

    const disableHost = await adminPATCH(
      new NextRequest(`${BASE}/${hostId}`, {
        method: "PATCH",
        headers: headers(sysAdmin),
        body: JSON.stringify({ disabled: true }),
      }),
      { params: Promise.resolve({ accountId: hostId }) },
    );
    expect(disableHost.status).toBe(200);

    expect(await listedNames("?status=disabled")).toEqual([
      "host-active",
      "own-active",
      "own-disabled",
    ]);

    for (const id of [ownId, hostId]) {
      expect((await auditsFor(id)).find((entry) => entry.action === "machine_account.disable"))
        .toMatchObject({ userId: sysAdmin.id });
    }

    for (const id of [ownId, hostId]) {
      const removed = await adminDELETE(
        new NextRequest(`${BASE}/${id}`, {
          method: "DELETE",
          headers: headers(sysAdmin),
        }),
        { params: Promise.resolve({ accountId: id }) },
      );
      expect(removed.status).toBe(200);
      expect(
        (await auditsFor(id)).find((entry) => entry.action === "machine_account.delete"),
      ).toMatchObject({ userId: sysAdmin.id });
    }

    expect(await listedNames("?status=disabled")).toEqual(["own-disabled"]);
  });
});
