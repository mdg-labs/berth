// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { and, eq, gt, isNull } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { sessions, users } from "@/lib/db/schema";

import { getSessionTtlSeconds } from "./config";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  systemRole: "admin" | "user";
  mustChangePassword: boolean;
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

export async function getActiveSession(
  sessionId: string,
): Promise<SessionUser | null> {
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

  return {
    id: row.userId,
    email: row.email,
    name: row.name,
    systemRole: row.systemRole,
    mustChangePassword: row.mustChangePassword,
  };
}
