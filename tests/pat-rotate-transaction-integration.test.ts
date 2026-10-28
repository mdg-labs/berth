// Copyright (c) 2026 Michael David Guggenbichler (MDG Labs), licensed under Apache-2.0 — see LICENSE

import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closeDb, getDb } from "@/lib/db";
import { runMigrations } from "@/lib/db/migrate";
import { auditLog, personalAccessTokens, users } from "@/lib/db/schema";
import { hashToken } from "@/lib/email/tokens";
import {
  createPersonalAccessToken,
  rotatePersonalAccessToken,
} from "@/lib/pat/store";

const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)("PAT rotation is atomic with its audit row", () => {
  const suffix = randomUUID().slice(0, 8);
  const triggerName = `fail_pat_rotate_audit_${suffix.replace(/-/g, "_")}`;
  const functionName = `${triggerName}_fn`;
  let userId: string;
  let userEmail: string;
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

  async function rotateAuditRows(id: string) {
    return getDb()
      .select()
      .from(auditLog)
      .where(eq(auditLog.resource, `pat:${id}`))
      .then((rows) => rows.filter((row) => row.action === "auth.pat_rotated"));
  }

  beforeAll(async () => {
    await runMigrations();
    userEmail = `pat-rotate-tx-${suffix}@example.test`;
    const [user] = await getDb()
      .insert(users)
      .values({ email: userEmail, name: `Rotator ${suffix}` })
      .returning({ id: users.id });
    userId = user!.id;
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
    await db.delete(auditLog).where(eq(auditLog.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
    await closeDb();
  });

  it("leaves the token untouched when the audit insert fails", async () => {
    const { id, secret } = await createPat(`atomic-${suffix}`);
    const before = await readRow(id);
    const db = getDb();

    await db.execute(
      sql.raw(`
        create function ${functionName}() returns trigger as $$
        begin
          if new.action = 'auth.pat_rotated' and new.resource = 'pat:${id}' then
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
      await expect(
        rotatePersonalAccessToken(userId, id, {}),
      ).rejects.toThrow();
    } finally {
      await db.execute(
        sql.raw(`drop trigger if exists ${triggerName} on audit_log`),
      );
      await db.execute(sql.raw(`drop function if exists ${functionName}()`));
    }

    const after = await readRow(id);
    expect(after.tokenHash).toBe(before.tokenHash);
    expect(after.tokenHash).toBe(hashToken(secret));
    expect(after.tokenPrefix).toBe(before.tokenPrefix);
    expect(after.expiresAt?.getTime()).toBe(before.expiresAt?.getTime());
    expect(after.lastUsedAt?.getTime() ?? null).toBe(
      before.lastUsedAt?.getTime() ?? null,
    );
    expect(await rotateAuditRows(id)).toHaveLength(0);
  });

  it("rotates and audits together once the audit insert works", async () => {
    const { id, secret } = await createPat(`success-${suffix}`);

    const result = await rotatePersonalAccessToken(userId, id, {}, "203.0.113.9");
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.token).not.toBe(secret);
    expect(result.summary.id).toBe(id);

    const row = await readRow(id);
    expect(row.tokenHash).toBe(hashToken(result.token));
    expect(row.tokenHash).not.toBe(hashToken(secret));

    const audits = await rotateAuditRows(id);
    expect(audits).toHaveLength(1);
    expect(audits[0]!.userId).toBe(userId);
    expect(audits[0]!.actorEmail).toBe(userEmail);
    expect(audits[0]!.actorName).toBe(`Rotator ${suffix}`);
    expect(audits[0]!.clientIp).toBe("203.0.113.9");
  });
});
