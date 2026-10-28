// Copyright (c) 2026 Michael David Guggenbichler (MDG Labs), licensed under Apache-2.0 — see LICENSE

import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closeDb, getDb } from "@/lib/db";
import { runMigrations } from "@/lib/db/migrate";
import { auditLog, personalAccessTokens, users } from "@/lib/db/schema";
import {
  createPersonalAccessToken,
  resolvePersonalAccessToken,
  revokePersonalAccessToken,
} from "@/lib/pat/store";

const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)("PAT revocation is atomic with its audit row", () => {
  const suffix = randomUUID().slice(0, 8);
  const triggerName = `fail_pat_revoke_audit_${suffix.replace(/-/g, "_")}`;
  const functionName = `${triggerName}_fn`;
  let userId: string;
  let userEmail: string;
  let otherUserId: string;
  const patIds: string[] = [];

  async function createPat(name: string) {
    const created = await createPersonalAccessToken(
      { id: userId, email: userEmail, systemRole: "user" },
      {
        name,
        allowPull: true,
        allowPush: false,
        expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        repositoryIds: null,
      },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) {
      throw new Error("token creation failed");
    }
    patIds.push(created.summary.id);
    return { id: created.summary.id, secret: created.token };
  }

  async function readRow(id: string) {
    const [row] = await getDb()
      .select()
      .from(personalAccessTokens)
      .where(eq(personalAccessTokens.id, id));
    return row!;
  }

  async function revokeAuditRows(id: string) {
    return getDb()
      .select()
      .from(auditLog)
      .where(eq(auditLog.resource, `pat:${id}`))
      .then((rows) => rows.filter((row) => row.action === "auth.pat_revoked"));
  }

  beforeAll(async () => {
    await runMigrations();
    userEmail = `pat-revoke-tx-${suffix}@example.test`;
    const [user] = await getDb()
      .insert(users)
      .values({ email: userEmail, name: `Revoker ${suffix}` })
      .returning({ id: users.id });
    userId = user!.id;
    const [other] = await getDb()
      .insert(users)
      .values({
        email: `pat-revoke-tx-other-${suffix}@example.test`,
        name: `Other ${suffix}`,
      })
      .returning({ id: users.id });
    otherUserId = other!.id;
  });

  afterAll(async () => {
    const db = getDb();
    await db.execute(
      sql.raw(`drop trigger if exists ${triggerName} on audit_log`),
    );
    await db.execute(sql.raw(`drop function if exists ${functionName}()`));
    for (const id of patIds) {
      await db.delete(auditLog).where(eq(auditLog.resource, `pat:${id}`));
      await db
        .delete(personalAccessTokens)
        .where(eq(personalAccessTokens.id, id));
    }
    for (const id of [userId, otherUserId]) {
      await db.delete(auditLog).where(eq(auditLog.userId, id));
      await db.delete(users).where(eq(users.id, id));
    }
    await closeDb();
  });

  it("leaves the token active when the audit insert fails", async () => {
    const { id, secret } = await createPat(`atomic-${suffix}`);
    const db = getDb();

    await db.execute(
      sql.raw(`
        create function ${functionName}() returns trigger as $$
        begin
          if new.action = 'auth.pat_revoked' and new.resource = 'pat:${id}' then
            raise exception 'forced audit failure';
          end if;
          return new;
        end;
        $$ language plpgsql
      `),
    );
    await db.execute(
      sql.raw(`
        create trigger ${triggerName} before insert on audit_log
        for each row execute function ${functionName}()
      `),
    );

    try {
      await expect(revokePersonalAccessToken(userId, id)).rejects.toThrow();
    } finally {
      await db.execute(
        sql.raw(`drop trigger if exists ${triggerName} on audit_log`),
      );
      await db.execute(sql.raw(`drop function if exists ${functionName}()`));
    }

    const after = await readRow(id);
    expect(after.revokedAt).toBeNull();
    expect(await revokeAuditRows(id)).toHaveLength(0);
    expect(await resolvePersonalAccessToken(secret)).not.toBeNull();
  });

  it("revokes and audits together once the audit insert works", async () => {
    const { id, secret } = await createPat(`success-${suffix}`);

    await expect(
      revokePersonalAccessToken(userId, id, "203.0.113.9"),
    ).resolves.toBe(true);

    const row = await readRow(id);
    expect(row.revokedAt).not.toBeNull();
    expect(await resolvePersonalAccessToken(secret)).toBeNull();

    const audits = await revokeAuditRows(id);
    expect(audits).toHaveLength(1);
    expect(audits[0]!.userId).toBe(userId);
    expect(audits[0]!.actorEmail).toBe(userEmail);
    expect(audits[0]!.actorName).toBe(`Revoker ${suffix}`);
    expect(audits[0]!.clientIp).toBe("203.0.113.9");
    expect(audits[0]!.metadata).toEqual({ name: `success-${suffix}` });
  });

  it("returns false without an audit row for an already-revoked token", async () => {
    const { id } = await createPat(`twice-${suffix}`);
    await expect(revokePersonalAccessToken(userId, id)).resolves.toBe(true);
    const revokedAt = (await readRow(id)).revokedAt;

    await expect(revokePersonalAccessToken(userId, id)).resolves.toBe(false);

    expect((await readRow(id)).revokedAt?.getTime()).toBe(revokedAt?.getTime());
    expect(await revokeAuditRows(id)).toHaveLength(1);
  });

  it("returns false without an audit row for a foreign token", async () => {
    const { id, secret } = await createPat(`foreign-${suffix}`);

    await expect(revokePersonalAccessToken(otherUserId, id)).resolves.toBe(
      false,
    );

    expect((await readRow(id)).revokedAt).toBeNull();
    expect(await resolvePersonalAccessToken(secret)).not.toBeNull();
    expect(await revokeAuditRows(id)).toHaveLength(0);
  });

  it("returns false without an audit row for an unknown token", async () => {
    const unknownId = randomUUID();

    await expect(revokePersonalAccessToken(userId, unknownId)).resolves.toBe(
      false,
    );

    expect(await revokeAuditRows(unknownId)).toHaveLength(0);
  });
});
