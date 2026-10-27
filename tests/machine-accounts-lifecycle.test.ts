// Copyright (c) 2026 Michael David Guggenbichler (MDG Labs), licensed under Apache-2.0 — see LICENSE

import { randomUUID } from "node:crypto";

import { and, eq, inArray, or } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  GET as adminGET,
  POST as adminPOST,
} from "@/app/api/admin/machine-accounts/route";
import { PATCH as adminPATCH } from "@/app/api/admin/machine-accounts/[accountId]/route";
import { POST as adminRotatePOST } from "@/app/api/admin/machine-accounts/[accountId]/rotate/route";
import { GET as tokenGET } from "@/app/api/auth/token/route";
import { PATCH as repoPATCH } from "@/app/api/repositories/[id]/machine-accounts/[accountId]/route";
import { POST as repoRotatePOST } from "@/app/api/repositories/[id]/machine-accounts/[accountId]/rotate/route";
import {
  GET as repoGET,
  POST as repoPOST,
} from "@/app/api/repositories/[id]/machine-accounts/route";
import { closeDb, getDb } from "@/lib/db";
import { runMigrations } from "@/lib/db/migrate";
import {
  auditLog,
  machineAccounts,
  repositories,
  repositoryMembers,
  systemSettings,
  users,
} from "@/lib/db/schema";
import { hashToken } from "@/lib/email/tokens";
import { resetRateLimits } from "@/lib/rate-limit/login";
import { SESSION_COOKIE_NAME } from "@/lib/session/config";
import { createSession } from "@/lib/session/store";

const databaseUrl = process.env.DATABASE_URL;
const suffix = randomUUID().slice(0, 8);
const DAY_MS = 24 * 60 * 60 * 1000;

type Actor = { id: string; cookie: string };
type Repo = { id: string; name: string };

let ipCounter = 0;

describe.skipIf(!databaseUrl)("machine account lifecycle against Postgres", () => {
  const userIds: string[] = [];
  const repositoryIds: string[] = [];
  const accountIds: string[] = [];
  let sysAdmin: Actor;
  let repoAdmin: Actor;
  let maintainer: Actor;
  let repoA: Repo;
  let repoB: Repo;

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
  const repoBase = (repositoryId: string) =>
    `http://localhost/api/repositories/${repositoryId}/machine-accounts`;
  const adminBase = "http://localhost/api/admin/machine-accounts";

  function repoCreate(actor: Actor | null, repo: Repo, body: unknown) {
    return repoPOST(
      new NextRequest(repoBase(repo.id), {
        method: "POST",
        headers: headers(actor),
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id: repo.id }) },
    );
  }

  function repoList(actor: Actor | null, repo: Repo) {
    return repoGET(
      new NextRequest(repoBase(repo.id), { headers: headers(actor) }),
      { params: Promise.resolve({ id: repo.id }) },
    );
  }

  function repoPatch(
    actor: Actor | null,
    repo: Repo,
    accountId: string,
    body: unknown,
  ) {
    return repoPATCH(
      new NextRequest(`${repoBase(repo.id)}/${accountId}`, {
        method: "PATCH",
        headers: headers(actor),
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id: repo.id, accountId }) },
    );
  }

  function repoRotate(
    actor: Actor | null,
    repo: Repo,
    accountId: string,
    body?: unknown,
  ) {
    return repoRotatePOST(
      new NextRequest(`${repoBase(repo.id)}/${accountId}/rotate`, {
        method: "POST",
        headers: headers(actor),
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      { params: Promise.resolve({ id: repo.id, accountId }) },
    );
  }

  function adminCreate(actor: Actor | null, body: unknown) {
    return adminPOST(
      new NextRequest(adminBase, {
        method: "POST",
        headers: headers(actor),
        body: JSON.stringify(body),
      }),
    );
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

  function adminRotate(actor: Actor | null, accountId: string, body?: unknown) {
    return adminRotatePOST(
      new NextRequest(`${adminBase}/${accountId}/rotate`, {
        method: "POST",
        headers: headers(actor),
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      { params: Promise.resolve({ accountId }) },
    );
  }

  function token(secret: string) {
    return tokenGET(
      new NextRequest("http://localhost/api/auth/token?service=registry", {
        headers: {
          authorization: `Basic ${Buffer.from(`whoever:${secret}`).toString("base64")}`,
          "x-forwarded-for": `203.0.113.${(++ipCounter % 250) + 1}`,
        },
      }),
    );
  }

  async function createRepoAccount(
    name: string,
    extra: Record<string, unknown> = {},
    repo: Repo = repoA,
  ) {
    const response = await repoCreate(repo === repoA ? repoAdmin : sysAdmin, repo, {
      name: `${name}-${randomUUID().slice(0, 6)}`,
      allowPull: true,
      allowPush: true,
      ...extra,
    });
    expect(response.status).toBe(201);
    const body = await response.json();
    accountIds.push(body.machineAccount.id);
    return body as {
      secret: string;
      machineAccount: { id: string; expiresAt: string | null };
    };
  }

  async function createHostAccount(name: string) {
    const response = await adminCreate(sysAdmin, {
      name: `${name}-${randomUUID().slice(0, 6)}`,
      repositoryIds: [repoA.id, repoB.id],
    });
    expect(response.status).toBe(201);
    const body = await response.json();
    accountIds.push(body.machineAccount.id);
    return body as { secret: string; machineAccount: { id: string } };
  }

  async function row(accountId: string) {
    const [found] = await getDb()
      .select()
      .from(machineAccounts)
      .where(eq(machineAccounts.id, accountId));
    return found!;
  }

  async function audits(accountId: string, action: string) {
    return getDb()
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.resource, `machine_account:${accountId}`),
          eq(auditLog.action, action),
        ),
      );
  }

  async function setPolicy(
    patMaxValidityDays: number | null,
    patAllowNeverExpire: boolean,
  ) {
    await getDb()
      .insert(systemSettings)
      .values({ id: "default", patMaxValidityDays, patAllowNeverExpire })
      .onConflictDoUpdate({
        target: systemSettings.id,
        set: { patMaxValidityDays, patAllowNeverExpire },
      });
  }

  let originalPolicy: {
    patMaxValidityDays: number | null;
    patAllowNeverExpire: boolean;
  } | null = null;

  beforeAll(async () => {
    await runMigrations();
    const [existing] = await getDb()
      .select({
        patMaxValidityDays: systemSettings.patMaxValidityDays,
        patAllowNeverExpire: systemSettings.patAllowNeverExpire,
      })
      .from(systemSettings)
      .where(eq(systemSettings.id, "default"));
    originalPolicy = existing ?? null;
    await setPolicy(null, true);

    sysAdmin = await makeUser("lcsysadmin", "admin");
    repoAdmin = await makeUser("lcrepoadmin");
    maintainer = await makeUser("lcmaintainer");
    repoA = await makeRepository("lcalpha");
    repoB = await makeRepository("lcbravo");
    await getDb()
      .insert(repositoryMembers)
      .values([
        { repositoryId: repoA.id, userId: repoAdmin.id, role: "admin" },
        { repositoryId: repoA.id, userId: maintainer.id, role: "maintainer" },
      ]);
  });

  beforeEach(async () => {
    resetRateLimits();
    await setPolicy(null, true);
  });

  afterAll(async () => {
    const db = getDb();
    if (originalPolicy) {
      await setPolicy(
        originalPolicy.patMaxValidityDays,
        originalPolicy.patAllowNeverExpire,
      );
    }
    await db
      .delete(auditLog)
      .where(
        or(
          inArray(auditLog.userId, userIds),
          inArray(auditLog.repositoryId, repositoryIds),
        ),
      );
    if (accountIds.length > 0) {
      await db
        .delete(machineAccounts)
        .where(inArray(machineAccounts.id, accountIds));
    }
    await db.delete(repositories).where(inArray(repositories.id, repositoryIds));
    await db.delete(users).where(inArray(users.id, userIds));
    await closeDb();
  });

  describe("rotate", () => {
    it("replaces the secret so the old one fails at once and the new one works", async () => {
      const created = await createRepoAccount("rot");
      expect((await token(created.secret)).status).toBe(200);
      const before = await row(created.machineAccount.id);
      expect(before.lastUsedAt).not.toBeNull();

      const response = await repoRotate(
        repoAdmin,
        repoA,
        created.machineAccount.id,
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      const body = await response.json();
      expect(body.secret).toMatch(/^bm_[A-Za-z0-9_-]{43}$/);
      expect(body.secret).not.toBe(created.secret);
      expect(JSON.stringify(body.machineAccount)).not.toContain(body.secret);

      expect((await token(created.secret)).status).toBe(401);
      expect((await token(body.secret)).status).toBe(200);

      const after = await row(created.machineAccount.id);
      expect(after.tokenHash).toBe(hashToken(body.secret));
      expect(after.tokenPrefix).toBe(body.secret.slice(0, 12));
      expect(after.id).toBe(before.id);

      const [entry] = await audits(created.machineAccount.id, "machine_account.rotate");
      expect(entry).toMatchObject({
        userId: repoAdmin.id,
        repositoryId: repoA.id,
        action: "machine_account.rotate",
      });
      expect(JSON.stringify(entry)).not.toContain(body.secret);
      expect(JSON.stringify(entry)).not.toContain(after.tokenHash);
    });

    it("rejects a body that is not a JSON object and leaves the secret alone", async () => {
      const created = await createRepoAccount("rotbad");
      const before = await row(created.machineAccount.id);

      for (const body of [[], "text", null, 5]) {
        const response = await repoRotate(
          repoAdmin,
          repoA,
          created.machineAccount.id,
          body,
        );
        expect(response.status).toBe(400);
      }
      const typed = await repoRotate(repoAdmin, repoA, created.machineAccount.id, {
        resetExpiry: "yes",
      });
      expect(typed.status).toBe(400);
      const both = await repoRotate(repoAdmin, repoA, created.machineAccount.id, {
        resetExpiry: true,
        expiresAt: new Date(Date.now() + DAY_MS).toISOString(),
      });
      expect(both.status).toBe(400);

      expect((await row(created.machineAccount.id)).tokenHash).toBe(
        before.tokenHash,
      );
      expect((await token(created.secret)).status).toBe(200);
    });

    it("answers 404 for a host account id on the repository route and rotates nothing", async () => {
      const host = await createHostAccount("hostrot");
      const before = await row(host.machineAccount.id);

      const response = await repoRotate(repoAdmin, repoA, host.machineAccount.id);
      expect(response.status).toBe(404);
      const asSystemAdmin = await repoRotate(
        sysAdmin,
        repoA,
        host.machineAccount.id,
      );
      expect(asSystemAdmin.status).toBe(404);

      expect((await row(host.machineAccount.id)).tokenHash).toBe(before.tokenHash);
      expect((await token(host.secret)).status).toBe(200);
      expect(
        await audits(host.machineAccount.id, "machine_account.rotate"),
      ).toHaveLength(0);
    });

    it("answers 404 for an account of another repository", async () => {
      const created = await createRepoAccount("rotelse", {}, repoB);
      const response = await repoRotate(sysAdmin, repoA, created.machineAccount.id);
      expect(response.status).toBe(404);
      expect((await token(created.secret)).status).toBe(200);
    });

    it("requires a session and the repository admin role", async () => {
      const created = await createRepoAccount("rotauth");
      expect(
        (await repoRotate(null, repoA, created.machineAccount.id)).status,
      ).toBe(401);
      expect(
        (await repoRotate(maintainer, repoA, created.machineAccount.id)).status,
      ).toBe(403);
      expect((await token(created.secret)).status).toBe(200);
    });

    it("lets a system admin rotate a host account and a repository account", async () => {
      const host = await createHostAccount("hostadmin");
      const response = await adminRotate(sysAdmin, host.machineAccount.id);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.machineAccount.kind).toBe("host");
      expect((await token(host.secret)).status).toBe(401);
      expect((await token(body.secret)).status).toBe(200);
      const [entry] = await audits(host.machineAccount.id, "machine_account.rotate");
      expect(entry).toMatchObject({ userId: sysAdmin.id, repositoryId: null });

      const repoAccount = await createRepoAccount("repoadminrot");
      const repoResponse = await adminRotate(sysAdmin, repoAccount.machineAccount.id);
      expect(repoResponse.status).toBe(200);
      expect((await token(repoAccount.secret)).status).toBe(401);
      const [repoEntry] = await audits(
        repoAccount.machineAccount.id,
        "machine_account.rotate",
      );
      expect(repoEntry).toMatchObject({ repositoryId: repoA.id });
    });

    it("keeps admin rotation to system admins and to existing accounts", async () => {
      const host = await createHostAccount("hostguard");
      expect((await adminRotate(null, host.machineAccount.id)).status).toBe(401);
      expect((await adminRotate(repoAdmin, host.machineAccount.id)).status).toBe(
        403,
      );
      expect((await adminRotate(sysAdmin, randomUUID())).status).toBe(404);
      expect((await adminRotate(sysAdmin, "not-a-uuid")).status).toBe(404);
      expect((await token(host.secret)).status).toBe(200);
    });

    it("refuses to rotate an expired account unless the expiry is replaced", async () => {
      const created = await createRepoAccount("rotexp");
      await getDb()
        .update(machineAccounts)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(machineAccounts.id, created.machineAccount.id));

      expect((await token(created.secret)).status).toBe(401);
      const refused = await repoRotate(repoAdmin, repoA, created.machineAccount.id);
      expect(refused.status).toBe(400);
      expect((await row(created.machineAccount.id)).tokenHash).toBe(
        hashToken(created.secret),
      );

      const renewed = await repoRotate(repoAdmin, repoA, created.machineAccount.id, {
        expiresAt: new Date(Date.now() + 7 * DAY_MS).toISOString(),
      });
      expect(renewed.status).toBe(200);
      const body = await renewed.json();
      expect(body.machineAccount.expiresAt).not.toBeNull();
      expect((await token(body.secret)).status).toBe(200);
    });

    it("keeps the expiry on rotation and resets it relative to the original lifetime", async () => {
      const expiresAt = new Date(Date.now() + 10 * DAY_MS).toISOString();
      const created = await createRepoAccount("rotkeep", { expiresAt });

      const kept = await (
        await repoRotate(repoAdmin, repoA, created.machineAccount.id)
      ).json();
      expect(new Date(kept.machineAccount.expiresAt).toISOString()).toBe(expiresAt);

      const reset = await (
        await repoRotate(repoAdmin, repoA, created.machineAccount.id, {
          resetExpiry: true,
        })
      ).json();
      expect(new Date(reset.machineAccount.expiresAt).getTime()).toBeGreaterThan(
        new Date(expiresAt).getTime() - 1000,
      );
    });

    it("applies the token policy to a replacement expiry", async () => {
      const created = await createRepoAccount("rotpol");
      await setPolicy(30, false);

      const never = await repoRotate(repoAdmin, repoA, created.machineAccount.id, {
        expiresAt: null,
      });
      expect(never.status).toBe(400);
      const tooFar = await repoRotate(repoAdmin, repoA, created.machineAccount.id, {
        expiresAt: new Date(Date.now() + 60 * DAY_MS).toISOString(),
      });
      expect(tooFar.status).toBe(400);
      const past = await repoRotate(repoAdmin, repoA, created.machineAccount.id, {
        expiresAt: new Date(Date.now() - DAY_MS).toISOString(),
      });
      expect(past.status).toBe(400);
      expect((await row(created.machineAccount.id)).tokenHash).toBe(
        hashToken(created.secret),
      );

      const fine = await repoRotate(repoAdmin, repoA, created.machineAccount.id, {
        expiresAt: new Date(Date.now() + 10 * DAY_MS).toISOString(),
      });
      expect(fine.status).toBe(200);
    });
  });

  describe("disable and enable", () => {
    it("disables, rejects the secret at the token endpoint, then enables again", async () => {
      const created = await createRepoAccount("toggle");
      const id = created.machineAccount.id;
      expect((await token(created.secret)).status).toBe(200);

      const disabled = await repoPatch(repoAdmin, repoA, id, { disabled: true });
      expect(disabled.status).toBe(200);
      expect((await disabled.json()).machineAccount.disabledAt).not.toBeNull();
      expect((await token(created.secret)).status).toBe(401);

      const enabled = await repoPatch(repoAdmin, repoA, id, { disabled: false });
      expect(enabled.status).toBe(200);
      expect((await enabled.json()).machineAccount.disabledAt).toBeNull();
      expect((await token(created.secret)).status).toBe(200);

      expect(await audits(id, "machine_account.disable")).toHaveLength(1);
      expect(await audits(id, "machine_account.enable")).toHaveLength(1);
      const [entry] = await audits(id, "machine_account.disable");
      expect(entry).toMatchObject({ userId: repoAdmin.id, repositoryId: repoA.id });
    });

    it("writes no audit entry and keeps the timestamp when the state does not change", async () => {
      const created = await createRepoAccount("idem");
      const id = created.machineAccount.id;

      await repoPatch(repoAdmin, repoA, id, { disabled: true });
      const first = (await row(id)).disabledAt;
      await repoPatch(repoAdmin, repoA, id, { disabled: true });
      expect((await row(id)).disabledAt).toEqual(first);
      expect(await audits(id, "machine_account.disable")).toHaveLength(1);

      await repoPatch(repoAdmin, repoA, id, { disabled: false });
      await repoPatch(repoAdmin, repoA, id, { disabled: false });
      expect(await audits(id, "machine_account.enable")).toHaveLength(1);
    });

    it("updates the description and audits it without touching the secret", async () => {
      const created = await createRepoAccount("desc");
      const id = created.machineAccount.id;

      const response = await repoPatch(repoAdmin, repoA, id, {
        description: "  nightly build  ",
      });
      expect(response.status).toBe(200);
      expect((await response.json()).machineAccount.description).toBe(
        "nightly build",
      );
      expect((await row(id)).tokenHash).toBe(hashToken(created.secret));
      const [entry] = await audits(id, "machine_account.update");
      expect(entry).toMatchObject({
        userId: repoAdmin.id,
        repositoryId: repoA.id,
        metadata: { descriptionChanged: true },
      });
      expect(await audits(id, "machine_account.disable")).toHaveLength(0);

      const cleared = await repoPatch(repoAdmin, repoA, id, { description: null });
      expect((await cleared.json()).machineAccount.description).toBeNull();
    });

    it("applies disabled and description together in one request", async () => {
      const created = await createRepoAccount("both");
      const id = created.machineAccount.id;
      const response = await repoPatch(repoAdmin, repoA, id, {
        disabled: true,
        description: "paused",
      });
      expect(response.status).toBe(200);
      expect(await audits(id, "machine_account.disable")).toHaveLength(1);
      expect(await audits(id, "machine_account.update")).toHaveLength(1);
    });

    it("rejects malformed bodies", async () => {
      const created = await createRepoAccount("badpatch");
      const id = created.machineAccount.id;
      for (const body of [[], "x", null, {}, { disabled: "true" }, { description: 5 }]) {
        const response = await repoPatch(repoAdmin, repoA, id, body);
        expect(response.status).toBe(400);
      }
      expect((await row(id)).disabledAt).toBeNull();
    });

    it("answers 404 for a host account and never disables it through the repository route", async () => {
      const host = await createHostAccount("hostpatch");
      const response = await repoPatch(sysAdmin, repoA, host.machineAccount.id, {
        disabled: true,
      });
      expect(response.status).toBe(404);
      const asRepoAdmin = await repoPatch(repoAdmin, repoA, host.machineAccount.id, {
        disabled: true,
      });
      expect(asRepoAdmin.status).toBe(404);
      expect((await row(host.machineAccount.id)).disabledAt).toBeNull();
      expect((await token(host.secret)).status).toBe(200);
    });

    it("requires a session and the repository admin role", async () => {
      const created = await createRepoAccount("patchauth");
      const id = created.machineAccount.id;
      expect((await repoPatch(null, repoA, id, { disabled: true })).status).toBe(401);
      expect(
        (await repoPatch(maintainer, repoA, id, { disabled: true })).status,
      ).toBe(403);
      expect((await row(id)).disabledAt).toBeNull();
    });

    it("lets a system admin disable and enable a host account", async () => {
      const host = await createHostAccount("hosttoggle");
      const id = host.machineAccount.id;

      expect((await adminPatch(repoAdmin, id, { disabled: true })).status).toBe(403);
      expect((await token(host.secret)).status).toBe(200);

      const disabled = await adminPatch(sysAdmin, id, { disabled: true });
      expect(disabled.status).toBe(200);
      expect((await disabled.json()).machineAccount.disabledAt).not.toBeNull();
      expect((await token(host.secret)).status).toBe(401);

      expect((await adminPatch(sysAdmin, id, { disabled: false })).status).toBe(200);
      expect((await token(host.secret)).status).toBe(200);

      const [off] = await audits(id, "machine_account.disable");
      expect(off).toMatchObject({ userId: sysAdmin.id, repositoryId: null });
      expect(await audits(id, "machine_account.enable")).toHaveLength(1);
      expect(await audits(id, "machine_account.update")).toHaveLength(0);
    });

    it("rejects a non-boolean disabled value on the admin route", async () => {
      const host = await createHostAccount("hostbad");
      const response = await adminPatch(sysAdmin, host.machineAccount.id, {
        disabled: "yes",
      });
      expect(response.status).toBe(400);
      expect((await row(host.machineAccount.id)).disabledAt).toBeNull();
    });
  });

  describe("expiry", () => {
    it("stores the expiry on create and rejects the secret once it passed", async () => {
      const expiresAt = new Date(Date.now() + 5 * DAY_MS).toISOString();
      const created = await createRepoAccount("exp", { expiresAt });
      expect(new Date(created.machineAccount.expiresAt!).toISOString()).toBe(
        expiresAt,
      );
      expect((await token(created.secret)).status).toBe(200);

      await getDb()
        .update(machineAccounts)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(machineAccounts.id, created.machineAccount.id));
      expect((await token(created.secret)).status).toBe(401);
    });

    it("applies the token policy to both create routes", async () => {
      await setPolicy(30, false);
      const omitted = await repoCreate(repoAdmin, repoA, {
        name: "polnone",
        allowPull: true,
      });
      expect(omitted.status).toBe(400);
      const tooFar = await repoCreate(repoAdmin, repoA, {
        name: "polfar",
        allowPull: true,
        expiresAt: new Date(Date.now() + 90 * DAY_MS).toISOString(),
      });
      expect(tooFar.status).toBe(400);
      const past = await repoCreate(repoAdmin, repoA, {
        name: "polpast",
        allowPull: true,
        expiresAt: new Date(Date.now() - DAY_MS).toISOString(),
      });
      expect(past.status).toBe(400);
      const garbage = await repoCreate(repoAdmin, repoA, {
        name: "polgarbage",
        allowPull: true,
        expiresAt: 12,
      });
      expect(garbage.status).toBe(400);

      const hostOmitted = await adminCreate(sysAdmin, {
        name: "hostpolnone",
        repositoryIds: [repoA.id],
      });
      expect(hostOmitted.status).toBe(400);
      const hostTooFar = await adminCreate(sysAdmin, {
        name: "hostpolfar",
        repositoryIds: [repoA.id],
        expiresAt: new Date(Date.now() + 90 * DAY_MS).toISOString(),
      });
      expect(hostTooFar.status).toBe(400);

      const ok = await repoCreate(repoAdmin, repoA, {
        name: `polok-${randomUUID().slice(0, 6)}`,
        allowPull: true,
        expiresAt: new Date(Date.now() + 10 * DAY_MS).toISOString(),
      });
      expect(ok.status).toBe(201);
      accountIds.push((await ok.json()).machineAccount.id);
      const hostOk = await adminCreate(sysAdmin, {
        name: `hostpolok-${randomUUID().slice(0, 6)}`,
        repositoryIds: [repoA.id],
        expiresAt: new Date(Date.now() + 10 * DAY_MS).toISOString(),
      });
      expect(hostOk.status).toBe(201);
      accountIds.push((await hostOk.json()).machineAccount.id);

      const names = (await getDb()
        .select({ name: machineAccounts.name })
        .from(machineAccounts)
        .where(inArray(machineAccounts.name, ["polnone", "polfar", "polpast", "hostpolnone", "hostpolfar"]))).map((entry) => entry.name);
      expect(names).toEqual([]);
    });

    it("accepts an expiry on a host account and honours it at the token endpoint", async () => {
      const response = await adminCreate(sysAdmin, {
        name: `hostexp-${randomUUID().slice(0, 6)}`,
        repositoryIds: [repoA.id],
        expiresAt: new Date(Date.now() + 3 * DAY_MS).toISOString(),
      });
      expect(response.status).toBe(201);
      const body = await response.json();
      accountIds.push(body.machineAccount.id);
      expect(body.machineAccount.expiresAt).not.toBeNull();
      expect((await token(body.secret)).status).toBe(200);

      await getDb()
        .update(machineAccounts)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(machineAccounts.id, body.machineAccount.id));
      expect((await token(body.secret)).status).toBe(401);
    });
  });

  describe("list", () => {
    it("shows expiry, disabled state and last use", async () => {
      const expiresAt = new Date(Date.now() + 5 * DAY_MS).toISOString();
      const created = await createRepoAccount("listing", { expiresAt });
      const id = created.machineAccount.id;

      const idle = (await (await repoList(repoAdmin, repoA)).json())
        .machineAccounts.find((entry: { id: string }) => entry.id === id);
      expect(idle).toMatchObject({ disabledAt: null, lastUsedAt: null });
      expect(new Date(idle.expiresAt).toISOString()).toBe(expiresAt);

      expect((await token(created.secret)).status).toBe(200);
      await repoPatch(repoAdmin, repoA, id, { disabled: true });

      const used = (await (await repoList(repoAdmin, repoA)).json())
        .machineAccounts.find((entry: { id: string }) => entry.id === id);
      expect(used.lastUsedAt).not.toBeNull();
      expect(used.disabledAt).not.toBeNull();
    });

    it("includes the lifecycle fields in the admin list", async () => {
      const host = await createHostAccount("adminlist");
      await adminPatch(sysAdmin, host.machineAccount.id, { disabled: true });
      const listed = (await (
        await adminGET(
          new NextRequest(adminBase, { headers: headers(sysAdmin) }),
        )
      ).json()).machineAccounts.find(
        (entry: { id: string }) => entry.id === host.machineAccount.id,
      );
      expect(listed).toHaveProperty("expiresAt", null);
      expect(listed).toHaveProperty("lastUsedAt", null);
      expect(listed.disabledAt).not.toBeNull();
    });
  });
});
