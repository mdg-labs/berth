// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { and, eq, gt, isNull } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { sessions, users } from "@/lib/db/schema";
import { isPastPurgeDeadline } from "@/lib/users/config";
import { purgeExpiredDeletedUsers } from "@/lib/users/lifecycle";
import { getUserDeletionState } from "@/lib/users/presentation";

import { getSessionTtlSeconds } from "./config";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  systemRole: "admin" | "user";
  mustChangePassword: boolean;
  hasPassword: boolean;
  mfaEnabled: boolean;
  pendingDeletion: boolean;
  deletedAt: string | null;
  purgesAt: string | null;
};

export async function createSession(userId: string): Promise<string> {
  const db = getDb();
  const expiresAt = new Date(Date.now() + getSessionTtlSeconds() * 1000);

  const [session] = await db
    .insert(sessions)
    .values({
      userId,
      expiresAt,
    })
    .returning({ id: sessions.id });

  if (!session) {
    throw new Error("Failed to create session");
  }

  return session.id;
}

export async function revokeSession(sessionId: string): Promise<void> {
  const db = getDb();
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)));
}

export async function revokeAllSessionsForUser(userId: string): Promise<void> {
  const db = getDb();
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
}

const MAX_CAUSE_DEPTH = 5;

// Drizzle wraps a failed query in an error whose `cause` is the driver error
// that carries the database code, so the chain is walked (bounded, in case of
// a cycle). Only the error name and the code are read; never the message,
// query or parameters.
function logPurgeFailure(error: unknown): void {
  let name = error instanceof Error ? error.name : typeof error;
  let code: string | undefined;
  let current: unknown = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth += 1) {
    if (typeof current !== "object" || current === null) break;
    const candidate = (current as { code?: unknown }).code;
    if (typeof candidate === "string" || typeof candidate === "number") {
      code = String(candidate);
      if (current instanceof Error) name = current.name;
      break;
    }
    current = (current as { cause?: unknown }).cause;
  }
  console.error("Failed to purge expired deleted users", { name, code });
}

export async function getActiveSession(
  sessionId: string,
): Promise<SessionUser | null> {
  try {
    await purgeExpiredDeletedUsers();
  } catch (error) {
    logPurgeFailure(error);
  }

  const db = getDb();
  const now = new Date();

  const [row] = await db
    .select({
      sessionId: sessions.id,
      userId: users.id,
      email: users.email,
      name: users.name,
      systemRole: users.systemRole,
      mustChangePassword: users.mustChangePassword,
      passwordHash: users.passwordHash,
      totpEnabledAt: users.totpEnabledAt,
      deletedAt: users.deletedAt,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(
      and(
        eq(sessions.id, sessionId),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, now),
      ),
    )
    .limit(1);

  if (!row) {
    return null;
  }

  if (row.deletedAt && isPastPurgeDeadline(row.deletedAt, now)) {
    const { hardDeleteUser } = await import("@/lib/users/lifecycle");
    try {
      await hardDeleteUser(row.userId);
    } catch (error) {
      logPurgeFailure(error);
    }
    return null;
  }

  const deletion = getUserDeletionState(row.deletedAt);

  return {
    id: row.userId,
    email: row.email,
    name: row.name,
    systemRole: row.systemRole,
    mustChangePassword: row.mustChangePassword,
    hasPassword: row.passwordHash !== null,
    mfaEnabled: row.totpEnabledAt !== null,
    pendingDeletion: deletion.pendingDeletion,
    deletedAt: deletion.deletedAt,
    purgesAt: deletion.purgesAt,
  };
}
