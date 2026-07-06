// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { eq } from "drizzle-orm";

import { writeAuditLog } from "@/lib/audit/log";
import { findUserByEmail, hashPassword, verifyPassword } from "@/lib/auth/credentials";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { reactivateUser } from "@/lib/users/lifecycle";
import { getUserDeletionState } from "@/lib/users/presentation";

export type AccountUser = {
  id: string;
  email: string;
  name: string;
  systemRole: "admin" | "user";
  mustChangePassword: boolean;
  hasPassword: boolean;
  pendingDeletion: boolean;
  deletedAt: string | null;
  purgesAt: string | null;
};

function toAccountUser(row: {
  id: string;
  email: string;
  name: string;
  systemRole: "admin" | "user";
  mustChangePassword: boolean;
  passwordHash: string | null;
  deletedAt: Date | null;
}): AccountUser {
  const deletion = getUserDeletionState(row.deletedAt);

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    systemRole: row.systemRole,
    mustChangePassword: row.mustChangePassword,
    hasPassword: row.passwordHash !== null,
    pendingDeletion: deletion.pendingDeletion,
    deletedAt: deletion.deletedAt,
    purgesAt: deletion.purgesAt,
  };
}

export async function getAccountUserById(
  userId: string,
): Promise<AccountUser | null> {
  const db = getDb();
  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      systemRole: users.systemRole,
      mustChangePassword: users.mustChangePassword,
      passwordHash: users.passwordHash,
      deletedAt: users.deletedAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return row ? toAccountUser(row) : null;
}

export async function updateAccount(
  userId: string,
  input: {
    name?: string;
    email?: string;
    currentPassword?: string;
  },
): Promise<
  AccountUser | { error: "not_found" | "forbidden" | "email_taken" | "invalid_password" }
> {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!existing) {
    return { error: "not_found" };
  }

  if (existing.passwordHash === null) {
    return { error: "forbidden" };
  }

  const updates: Partial<typeof users.$inferInsert> = {};

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) {
      return { error: "forbidden" };
    }
    if (name !== existing.name) {
      updates.name = name;
    }
  }

  if (input.email !== undefined) {
    const email = input.email.trim().toLowerCase();
    if (!email) {
      return { error: "forbidden" };
    }

    if (!input.currentPassword) {
      return { error: "invalid_password" };
    }

    if (!(await verifyPassword(existing.passwordHash, input.currentPassword))) {
      return { error: "invalid_password" };
    }

    if (email !== existing.email) {
      const taken = await findUserByEmail(email);
      if (taken && taken.id !== existing.id) {
        return { error: "email_taken" };
      }
      updates.email = email;
    }
  }

  if (Object.keys(updates).length === 0) {
    return toAccountUser(existing);
  }

  const [updated] = await db
    .update(users)
    .set(updates)
    .where(eq(users.id, userId))
    .returning({
      id: users.id,
      email: users.email,
      name: users.name,
      systemRole: users.systemRole,
      mustChangePassword: users.mustChangePassword,
      passwordHash: users.passwordHash,
      deletedAt: users.deletedAt,
    });

  if (!updated) {
    return { error: "not_found" };
  }

  await writeAuditLog({
    userId,
    action: "account.update",
    resource: `user:${updated.email}`,
  });

  return toAccountUser(updated);
}

export async function reactivateOwnAccount(
  userId: string,
): Promise<AccountUser | { error: "not_found" | "not_pending_deletion" }> {
  const current = await getAccountUserById(userId);
  if (!current) {
    return { error: "not_found" };
  }

  if (!current.pendingDeletion) {
    return { error: "not_pending_deletion" };
  }

  const result = await reactivateUser(userId, userId);
  if ("error" in result && result.error === "not_found") {
    return { error: "not_found" };
  }

  const user = await getAccountUserById(userId);
  if (!user) {
    return { error: "not_found" };
  }

  return user;
}

export async function adminResetUserPassword(
  actorId: string,
  userId: string,
  password?: string,
): Promise<
  | { ok: true; mustChangePassword: boolean }
  | { error: "not_found" | "forbidden" }
> {
  const db = getDb();
  const [existing] = await db
    .select({
      id: users.id,
      passwordHash: users.passwordHash,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!existing) {
    return { error: "not_found" };
  }

  if (existing.passwordHash === null) {
    return { error: "forbidden" };
  }

  const { generateBootstrapPassword } = await import("@/lib/bootstrap/admin");
  const nextPassword = password?.trim() || generateBootstrapPassword();
  const mustChangePassword = !password?.trim();
  const passwordHash = await hashPassword(nextPassword);

  await db
    .update(users)
    .set({ passwordHash, mustChangePassword })
    .where(eq(users.id, userId));

  await writeAuditLog({
    userId: actorId,
    action: "user.reset_password",
    resource: `user:${userId}`,
  });

  return { ok: true, mustChangePassword };
}
