// Copyright (c) 2026 Michael David Guggenbichler (MDG Labs), licensed under Apache-2.0 — see LICENSE

import { randomUUID } from "node:crypto";

import { inArray } from "drizzle-orm";
import { decodeJwt } from "jose";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { GET as tokenGET } from "@/app/api/auth/token/route";
import { closeDb, getDb } from "@/lib/db";
import { runMigrations } from "@/lib/db/migrate";
import {
  imageSettings,
  machineAccounts,
  repositories,
} from "@/lib/db/schema";
import { generateToken, hashToken } from "@/lib/email/tokens";
import { MACHINE_ACCOUNT_PREFIX } from "@/lib/machine-accounts/config";
import { resetRateLimits } from "@/lib/rate-limit/login";

const databaseUrl = process.env.DATABASE_URL;
const suffix = randomUUID().slice(0, 8);

let ipCounter = 0;

describe.skipIf(!databaseUrl)("machine account tokens against Postgres", () => {
  const repositoryIds: string[] = [];
  let own: { id: string; name: string };
  let other: { id: string; name: string };
  let open: { id: string; name: string };

  async function makeRepository(label: string, isPublic = false) {
    const [repo] = await getDb()
      .insert(repositories)
      .values({ name: `${label}-${suffix}`, isPublic })
      .returning({ id: repositories.id, name: repositories.name });
    repositoryIds.push(repo!.id);
    return repo!;
  }

  async function makeAccount(
    values: Partial<typeof machineAccounts.$inferInsert> & {
      ownerRepositoryId: string | null;
    },
  ) {
    const secret = `${MACHINE_ACCOUNT_PREFIX}${generateToken()}`;
    const [row] = await getDb()
      .insert(machineAccounts)
      .values({
        name: `acct-${randomUUID().slice(0, 8)}`,
        tokenPrefix: secret.slice(0, 12),
        tokenHash: hashToken(secret),
        allowPull: true,
        allowPush: true,
        ...values,
      })
      .returning({ id: machineAccounts.id });
    return { id: row!.id, secret };
  }

  async function token(secret: string, scope?: string) {
    const query = scope ? `&scope=${encodeURIComponent(scope)}` : "";
    return tokenGET(
      new NextRequest(`http://localhost/api/auth/token?service=registry${query}`, {
        headers: {
          authorization: `Basic ${Buffer.from(`whoever:${secret}`).toString("base64")}`,
          "x-forwarded-for": `203.0.113.${(++ipCounter % 250) + 1}`,
        },
      }),
    );
  }

  async function grantedAccess(secret: string, scope: string) {
    const response = await token(secret, scope);
    expect(response.status).toBe(200);
    return decodeJwt((await response.json()).token).access;
  }

  beforeAll(async () => {
    await runMigrations();
    own = await makeRepository("own");
    other = await makeRepository("other");
    open = await makeRepository("open", true);
    await getDb()
      .insert(imageSettings)
      .values({
        repositoryId: other.id,
        name: "shared",
        anonymousPull: "allow",
      });
  });

  beforeEach(() => {
    resetRateLimits();
  });

  afterAll(async () => {
    await getDb()
      .delete(repositories)
      .where(inArray(repositories.id, repositoryIds));
    await closeDb();
  });

  it("grants exactly pull,push on the own repository and never delete", async () => {
    const { id, secret } = await makeAccount({ ownerRepositoryId: own.id });

    const response = await token(
      secret,
      `repository:${own.name}/app:pull,push,delete`,
    );
    expect(response.status).toBe(200);
    const claims = decodeJwt((await response.json()).token);
    expect(claims.sub).toBe(`machine:${id}`);
    expect(claims.berth_machine_account).toBe(id);
    expect(claims.access).toEqual([
      { type: "repository", name: `${own.name}/app`, actions: ["pull", "push"] },
    ]);
  });

  it("answers a login without scope with a token granting nothing", async () => {
    const { secret } = await makeAccount({ ownerRepositoryId: own.id });

    const response = await token(secret);
    expect(response.status).toBe(200);
    expect(decodeJwt((await response.json()).token).access).toEqual([]);
  });

  it("denies push and private pull on another repository", async () => {
    const { secret } = await makeAccount({ ownerRepositoryId: own.id });

    expect(
      (await token(secret, `repository:${other.name}/app:push`)).status,
    ).toBe(403);
    expect(
      (await token(secret, `repository:${other.name}/app:pull`)).status,
    ).toBe(403);
    expect(
      (await token(secret, `repository:${open.name}/app:push`)).status,
    ).toBe(403);
  });

  it("grants pull on images another repository allows anonymously", async () => {
    const { secret } = await makeAccount({ ownerRepositoryId: own.id });

    expect(
      await grantedAccess(secret, `repository:${other.name}/shared:pull,push`),
    ).toEqual([
      { type: "repository", name: `${other.name}/shared`, actions: ["pull"] },
    ]);
    expect(
      await grantedAccess(secret, `repository:${open.name}/app:pull`),
    ).toEqual([
      { type: "repository", name: `${open.name}/app`, actions: ["pull"] },
    ]);
  });

  it("keeps cross-repository blob-mount requests working", async () => {
    const { secret } = await makeAccount({ ownerRepositoryId: own.id });

    expect(
      await grantedAccess(
        secret,
        `repository:${own.name}/app:push,pull repository:${other.name}/app:pull`,
      ),
    ).toEqual([
      {
        type: "repository",
        name: `${own.name}/app`,
        actions: ["push", "pull"],
      },
    ]);
  });

  it("denies push to a pull-only account on its own repository", async () => {
    const { secret } = await makeAccount({
      ownerRepositoryId: own.id,
      allowPush: false,
    });

    expect((await token(secret, `repository:${own.name}/app:push`)).status).toBe(
      403,
    );
    expect(
      await grantedAccess(secret, `repository:${own.name}/app:pull,push`),
    ).toEqual([
      { type: "repository", name: `${own.name}/app`, actions: ["pull"] },
    ]);
  });

  it("rejects a scope on a missing repository with repository_not_found", async () => {
    const { secret } = await makeAccount({ ownerRepositoryId: own.id });

    const response = await token(secret, `repository:missing-${suffix}/app:pull`);
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("repository_not_found");
  });

  it("rejects unknown, disabled and expired secrets with 401", async () => {
    const disabled = await makeAccount({
      ownerRepositoryId: own.id,
      disabledAt: new Date(Date.now() - 1_000),
    });
    const expired = await makeAccount({
      ownerRepositoryId: own.id,
      expiresAt: new Date(Date.now() - 1_000),
    });
    const unknown = `${MACHINE_ACCOUNT_PREFIX}${generateToken()}`;
    const future = await makeAccount({
      ownerRepositoryId: own.id,
      expiresAt: new Date(Date.now() + 60_000),
    });

    for (const secret of [disabled.secret, expired.secret, unknown]) {
      for (const scope of [undefined, `repository:${own.name}/app:pull`]) {
        const response = await token(secret, scope);
        expect(response.status).toBe(401);
        expect(await response.json()).not.toHaveProperty("token");
      }
    }
    expect((await token(future.secret)).status).toBe(200);
  });

  it("grants an account without an owner repository nothing on private repositories", async () => {
    const { secret } = await makeAccount({ ownerRepositoryId: null });

    expect(
      (await token(secret, `repository:${own.name}/app:pull`)).status,
    ).toBe(403);
    expect(
      (await token(secret, `repository:${own.name}/app:push`)).status,
    ).toBe(403);
    expect(await grantedAccess(secret, `repository:${open.name}/app:pull`)).toEqual(
      [{ type: "repository", name: `${open.name}/app`, actions: ["pull"] }],
    );
  });

  it("drops catalog scopes and denies a request left empty", async () => {
    const { secret } = await makeAccount({ ownerRepositoryId: own.id });

    expect((await token(secret, "registry:catalog:*")).status).toBe(403);
  });
});
