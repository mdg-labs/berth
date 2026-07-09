// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { and, eq, gt, isNull } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { sessions, users } from "@/lib/db/schema";
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

export async function getActiveSession(
  sessionId: string,
): Promise<SessionUser | null> {
  await purgeExpiredDeletedUsers();

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

  const deletion = getUserDeletionState(row.deletedAt);
  if (deletion.status === "pending_deletion" && deletion.purgesAt) {
    const purgesAt = new Date(deletion.purgesAt);
    if (purgesAt.getTime() <= now.getTime()) {
      const { hardDeleteUser } = await import("@/lib/users/lifecycle");
      await hardDeleteUser(row.userId);
      return null;
    }
  }

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
