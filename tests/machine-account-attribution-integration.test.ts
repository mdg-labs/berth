// Copyright (c) 2026 Michael David Guggenbichler (MDG Labs), licensed under Apache-2.0 — see LICENSE

import { randomUUID } from "node:crypto";

import { and, eq, inArray, or } from "drizzle-orm";
import { NextRequest } from "next/server";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { GET as tokenGET } from "@/app/api/auth/token/route";
import { listAuditLog } from "@/lib/audit/query";
import { closeDb, getDb } from "@/lib/db";
import { runMigrations } from "@/lib/db/migrate";
import {
  auditLog,
  machineAccounts,
  pullEvents,
  repositories,
  users,
} from "@/lib/db/schema";
import { generateToken, hashToken } from "@/lib/email/tokens";
import { MACHINE_ACCOUNT_PREFIX } from "@/lib/machine-accounts/config";
import { PAT_LAST_USED_THROTTLE_MS } from "@/lib/pat/config";
import { resetRateLimits } from "@/lib/rate-limit/login";
import { proxyRegistryRequest } from "@/lib/registry/proxy/forward";
import { resetSigningKeyCache } from "@/lib/token/keys";
import { issueRegistryToken } from "@/lib/token/issue";

const databaseUrl = process.env.DATABASE_URL;
const suffix = randomUUID().slice(0, 8);
const DIGEST = `sha256:${"a".repeat(64)}`;

let ipCounter = 0;

describe.skipIf(!databaseUrl)(
  "machine account attribution against Postgres",
  () => {
    const repositoryIds: string[] = [];
    const userIds: string[] = [];
    const accountIds: string[] = [];
    let own: { id: string; name: string };
    let other: { id: string; name: string };

    async function makeRepository(label: string) {
      const [repo] = await getDb()
        .insert(repositories)
        .values({ name: `${label}-${suffix}` })
        .returning({ id: repositories.id, name: repositories.name });
      repositoryIds.push(repo!.id);
      return repo!;
    }

    async function makeAccount(
      ownerRepositoryId: string | null,
      name = `acct-${randomUUID().slice(0, 8)}`,
    ) {
      const secret = `${MACHINE_ACCOUNT_PREFIX}${generateToken()}`;
      const [row] = await getDb()
        .insert(machineAccounts)
        .values({
          ownerRepositoryId,
          name,
          tokenPrefix: secret.slice(0, 12),
          tokenHash: hashToken(secret),
          allowPull: true,
          allowPush: true,
        })
        .returning({ id: machineAccounts.id });
      accountIds.push(row!.id);
      return { id: row!.id, name, secret };
    }

    function tokenRequest(secret: string, scope?: string) {
      const query = scope ? `&scope=${encodeURIComponent(scope)}` : "";
      return tokenGET(
        new NextRequest(
          `http://localhost/api/auth/token?service=registry${query}`,
          {
            headers: {
              authorization: `Basic ${Buffer.from(`whoever:${secret}`).toString("base64")}`,
              "x-forwarded-for": `203.0.113.${(++ipCounter % 250) + 1}`,
            },
          },
        ),
      );
    }

    async function machineToken(secret: string, scope: string) {
      const response = await tokenRequest(secret, scope);
      expect(response.status).toBe(200);
      return (await response.json()).token as string;
    }

    async function viaProxy(
      method: "GET" | "PUT",
      repositoryName: string,
      reference: string,
      bearer: string,
    ) {
      const response = await proxyRegistryRequest(
        new NextRequest(
          `http://localhost/v2/${repositoryName}/app/manifests/${reference}`,
          { method, headers: { authorization: `Bearer ${bearer}` } },
        ),
      );
      expect(response.status).toBe(method === "PUT" ? 201 : 200);
    }

    async function pushEntries(repositoryId: string) {
      return getDb()
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.repositoryId, repositoryId),
            eq(auditLog.action, "registry.manifest.push"),
          ),
        );
    }

    async function usedEntries(accountId: string) {
      return getDb()
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.action, "machine_account.used"),
            eq(auditLog.resource, `machine_account:${accountId}`),
          ),
        );
    }

    beforeAll(async () => {
      await runMigrations();
      own = await makeRepository("attr-own");
      other = await makeRepository("attr-other");
    });

    beforeEach(() => {
      vi.stubEnv("TOKEN_SIGNING_KEY_PATH", "docker/token/dev-signing-key.pem");
      vi.stubEnv("TOKEN_CERT_PATH", "docker/registry/certs/rootcert.pem");
      vi.stubEnv("TOKEN_ISSUER", "registry");
      vi.stubEnv("REGISTRY_AUTH_TOKEN_SERVICE", "registry");
      vi.stubEnv("RATE_LIMIT_TOKEN_MAX_ATTEMPTS", "1000");
      resetSigningKeyCache();
      resetRateLimits();
      vi.stubGlobal(
        "fetch",
        vi.fn(
          async (_url: string, init: RequestInit) =>
            new Response(null, {
              status: init.method === "PUT" ? 201 : 200,
              headers: { "docker-content-digest": DIGEST },
            }),
        ),
      );
    });

    afterEach(() => {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
      resetSigningKeyCache();
    });

    afterAll(async () => {
      const db = getDb();
      await db
        .delete(auditLog)
        .where(
          or(
            inArray(auditLog.repositoryId, repositoryIds),
            inArray(auditLog.userId, userIds),
          ),
        );
      await db.delete(machineAccounts).where(inArray(machineAccounts.id, accountIds));
      await db.delete(repositories).where(inArray(repositories.id, repositoryIds));
      if (userIds.length > 0) {
        await db.delete(users).where(inArray(users.id, userIds));
      }
      await closeDb();
    });

    it("attributes a manifest push to the machine account with a metadata snapshot", async () => {
      const account = await makeAccount(own.id, "pusher");
      const bearer = await machineToken(
        account.secret,
        `repository:${own.name}/app:pull,push`,
      );

      await viaProxy("PUT", own.name, "1.0", bearer);

      await vi.waitFor(async () =>
        expect(await pushEntries(own.id)).toHaveLength(1),
      );
      const [entry] = await pushEntries(own.id);
      expect(entry).toMatchObject({
        userId: null,
        machineAccountId: account.id,
        action: "registry.manifest.push",
        metadata: {
          reference: "1.0",
          digest: DIGEST,
          machineAccount: { id: account.id, name: "pusher", kind: "repository" },
        },
      });
      expect(JSON.stringify(entry!.metadata)).not.toContain(account.secret);

      const listed = await listAuditLog({
        repositoryId: own.id,
        action: "registry.manifest.push",
      });
      expect(listed.entries[0]?.actor).toMatchObject({
        userId: null,
        machineAccount: { id: account.id, name: "pusher", kind: "repository", deleted: false },
      });
    });

    it("records a machine pull in pull_events as non-anonymous with no user", async () => {
      const account = await makeAccount(own.id);
      const bearer = await machineToken(
        account.secret,
        `repository:${own.name}/app:pull`,
      );

      await viaProxy("GET", own.name, "2.0", bearer);

      await vi.waitFor(async () => {
        const rows = await getDb()
          .select()
          .from(pullEvents)
          .where(eq(pullEvents.machineAccountId, account.id));
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
          userId: null,
          anonymous: false,
          repositoryId: own.id,
          tagReference: "2.0",
        });
      });
    });

    it("never attributes a user token whose subject looks like a machine account", async () => {
      const account = await makeAccount(own.id);
      const [user] = await getDb()
        .insert(users)
        .values({
          email: `machine:${account.id}`,
          name: `lookalike ${suffix}`,
          systemRole: "user",
        })
        .returning({ id: users.id });
      userIds.push(user!.id);

      const bearer = (
        await issueRegistryToken(`machine:${account.id}`, "registry", [
          { type: "repository", name: `${own.name}/app`, actions: ["pull", "push"] },
        ])
      ).token;

      await viaProxy("PUT", own.name, "3.0", bearer);
      await viaProxy("GET", own.name, "3.0", bearer);

      await vi.waitFor(async () => {
        const pushes = (await pushEntries(own.id)).filter(
          (entry) =>
            (entry.metadata as { reference?: string } | null)?.reference === "3.0",
        );
        expect(pushes).toHaveLength(1);
        expect(pushes[0]).toMatchObject({
          userId: user!.id,
          machineAccountId: null,
        });
        expect(pushes[0]!.metadata).not.toHaveProperty("machineAccount");

        const pulls = await getDb()
          .select()
          .from(pullEvents)
          .where(eq(pullEvents.userId, user!.id));
        expect(pulls).toHaveLength(1);
        expect(pulls[0]).toMatchObject({ machineAccountId: null, anonymous: false });
      });
    });

    it("writes one machine_account.used entry per throttle window and none inside it", async () => {
      const account = await makeAccount(own.id);
      const scope = `repository:${own.name}/app:pull,push`;

      await machineToken(account.secret, scope);
      await machineToken(account.secret, scope);

      const entries = await usedEntries(account.id);
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        userId: null,
        machineAccountId: account.id,
        repositoryId: own.id,
        metadata: {
          machineAccount: { id: account.id, name: account.name, kind: "repository" },
          repositories: [own.name],
        },
      });
      expect(JSON.stringify(entries[0]!.metadata)).not.toContain(account.secret);
      const [row] = await getDb()
        .select({ lastUsedAt: machineAccounts.lastUsedAt })
        .from(machineAccounts)
        .where(eq(machineAccounts.id, account.id));
      expect(row!.lastUsedAt).toBeInstanceOf(Date);

      await getDb()
        .update(machineAccounts)
        .set({ lastUsedAt: new Date(Date.now() - PAT_LAST_USED_THROTTLE_MS - 1000) })
        .where(eq(machineAccounts.id, account.id));
      await machineToken(account.secret, scope);
      expect(await usedEntries(account.id)).toHaveLength(2);
    });

    it("writes exactly one entry for concurrent issuances", async () => {
      const account = await makeAccount(own.id);
      const scope = `repository:${own.name}/app:pull`;

      const responses = await Promise.all(
        Array.from({ length: 6 }, () => tokenRequest(account.secret, scope)),
      );
      expect(responses.map((response) => response.status)).toEqual(
        Array(6).fill(200),
      );

      expect(await usedEntries(account.id)).toHaveLength(1);
    });

    it("records host accounts without an owner repository and lists the granted names", async () => {
      const host = await makeAccount(null, "host-ci");
      await getDb()
        .update(repositories)
        .set({ isPublic: true })
        .where(eq(repositories.id, other.id));

      try {
        await machineToken(
          host.secret,
          `repository:${other.name}/app:pull`,
        );
      } finally {
        await getDb()
          .update(repositories)
          .set({ isPublic: false })
          .where(eq(repositories.id, other.id));
      }

      const [entry] = await usedEntries(host.id);
      expect(entry).toMatchObject({
        repositoryId: null,
        machineAccountId: host.id,
        metadata: {
          machineAccount: { id: host.id, name: "host-ci", kind: "host" },
          repositories: [other.name],
        },
      });

      const listed = await listAuditLog({ actor: "host-ci", action: "machine_account.used" });
      expect(listed.entries[0]?.actor.machineAccount).toMatchObject({
        id: host.id,
        kind: "host",
        deleted: false,
      });
    });

    it("keeps entries readable after the account is deleted", async () => {
      const account = await makeAccount(own.id, "doomed");
      const bearer = await machineToken(
        account.secret,
        `repository:${own.name}/app:push`,
      );
      await viaProxy("PUT", own.name, "4.0", bearer);
      await vi.waitFor(async () =>
        expect(
          (await pushEntries(own.id)).filter(
            (entry) => entry.machineAccountId === account.id,
          ),
        ).toHaveLength(1),
      );

      const live = await listAuditLog({ repositoryId: own.id, actor: "doomed" });
      expect(live.entries.length).toBeGreaterThanOrEqual(2);

      await getDb().delete(machineAccounts).where(eq(machineAccounts.id, account.id));

      const afterDelete = await listAuditLog({ repositoryId: own.id, actor: "doomed" });
      expect(afterDelete.entries.length).toBe(live.entries.length);
      for (const entry of afterDelete.entries) {
        expect(entry.actor.machineAccount).toMatchObject({
          id: account.id,
          name: "doomed",
          kind: "repository",
          deleted: true,
        });
      }
      const [pushed] = (await pushEntries(own.id)).filter(
        (entry) =>
          (entry.metadata as { reference?: string } | null)?.reference === "4.0",
      );
      expect(pushed).toMatchObject({
        machineAccountId: null,
        userId: null,
        metadata: { machineAccount: { id: account.id, name: "doomed" } },
      });
    });

    it("lists legacy entries without machine metadata as before", async () => {
      await getDb().insert(auditLog).values({
        userId: null,
        repositoryId: other.id,
        action: "registry.manifest.push",
        resource: `repository:${other.name}/image:app:tag:legacy`,
        metadata: { reference: "legacy" },
      });

      const listed = await listAuditLog({ repositoryId: other.id });
      expect(listed.entries[0]?.actor).toEqual({
        userId: null,
        email: null,
        name: null,
        machineAccount: null,
      });
    });
  },
);
