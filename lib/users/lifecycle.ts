// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { and, eq, isNotNull, isNull, lt, ne } from "drizzle-orm";

import { writeAuditLog } from "@/lib/audit/log";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { revokeAllSessionsForUser } from "@/lib/session/store";
import { revokeAllPersonalAccessTokensForUser } from "@/lib/pat/store";
import {
  getUserDeleteGracePeriodDays,
  getUserDeleteGracePeriodMs,
  isPastPurgeDeadline,
} from "@/lib/users/config";

export type UserLifecycleError =
  | "not_found"
  | "forbidden"
  | "last_admin"
  | "not_pending_deletion";

export async function countActiveSystemAdmins(excludeUserId?: string): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.systemRole, "admin"),
        isNull(users.deletedAt),
        excludeUserId ? ne(users.id, excludeUserId) : undefined,
      ),
    );

  return rows.length;
}

export async function purgeExpiredDeletedUsers(): Promise<number> {
  const db = getDb();
  const graceMs = getUserDeleteGracePeriodMs();

  if (graceMs === 0) {
    return 0;
  }

  const cutoff = new Date(Date.now() - graceMs);
  const expired = await db
    .select({ id: users.id })
    .from(users)
    .where(and(isNotNull(users.deletedAt), lt(users.deletedAt, cutoff)));

  for (const row of expired) {
    await hardDeleteUser(row.id);
  }

  return expired.length;
}

export async function hardDeleteUser(userId: string): Promise<void> {
  const db = getDb();
  await db.delete(users).where(eq(users.id, userId));
}

export async function softDeleteUser(
  actorId: string,
  targetUserId: string,
): Promise<{ ok: true } | { error: UserLifecycleError }> {
  if (actorId === targetUserId) {
    return { error: "forbidden" };
  }

  const db = getDb();
  const [target] = await db
    .select({
      id: users.id,
      email: users.email,
      systemRole: users.systemRole,
      deletedAt: users.deletedAt,
    })
    .from(users)
    .where(eq(users.id, targetUserId))
    .limit(1);

  if (!target) {
    return { error: "not_found" };
  }

  if (target.deletedAt) {
    return { ok: true };
  }

  if (target.systemRole === "admin") {
    const remainingAdmins = await countActiveSystemAdmins(targetUserId);
    if (remainingAdmins === 0) {
      return { error: "last_admin" };
    }
  }

  const deletedAt = new Date();
  await db
    .update(users)
    .set({ deletedAt })
    .where(eq(users.id, targetUserId));

  await revokeAllSessionsForUser(targetUserId);
  await revokeAllPersonalAccessTokensForUser(targetUserId);

  await writeAuditLog({
    userId: actorId,
    action: "user.soft_delete",
    resource: `user:${target.email}`,
  });

  if (getUserDeleteGracePeriodDays() === 0) {
    await hardDeleteUser(targetUserId);
    await writeAuditLog({
      userId: actorId,
      action: "user.hard_delete",
      resource: `user:${target.email}`,
    });
  }

  return { ok: true };
}

export async function reactivateUser(
  actorId: string,
  targetUserId: string,
): Promise<{ ok: true } | { error: UserLifecycleError }> {
  const db = getDb();
  const [target] = await db
    .select({
      id: users.id,
      email: users.email,
      deletedAt: users.deletedAt,
    })
    .from(users)
    .where(eq(users.id, targetUserId))
    .limit(1);

  if (!target) {
    return { error: "not_found" };
  }

  if (!target.deletedAt) {
    return { ok: true };
  }

  if (isPastPurgeDeadline(target.deletedAt)) {
    await hardDeleteUser(targetUserId);
    return { error: "not_found" };
  }

  await db
    .update(users)
    .set({ deletedAt: null })
    .where(eq(users.id, targetUserId));

  await writeAuditLog({
    userId: actorId,
    action: "user.reactivate",
    resource: `user:${target.email}`,
  });

  return { ok: true };
}

export async function resolveUserForAuthentication(user: {
  id: string;
  deletedAt: Date | null;
}): Promise<"active" | "pending_deletion" | "purged"> {
  if (!user.deletedAt) {
    return "active";
  }

  if (isPastPurgeDeadline(user.deletedAt)) {
    await hardDeleteUser(user.id);
    return "purged";
  }

  return "pending_deletion";
}
