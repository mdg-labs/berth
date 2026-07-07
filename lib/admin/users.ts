// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { desc, eq } from "drizzle-orm";

import { writeAuditLog } from "@/lib/audit/log";
import { sendSetPasswordEmailForUser } from "@/lib/auth/password-reset";
import { findUserByEmail, hashPassword } from "@/lib/auth/credentials";
import { generateBootstrapPassword } from "@/lib/bootstrap/admin";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import type { SystemRole } from "@/lib/rbac/types";
import { adminResetUserPassword } from "@/lib/users/account";
import { purgeExpiredDeletedUsers, reactivateUser, softDeleteUser } from "@/lib/users/lifecycle";
import { getUserDeletionState } from "@/lib/users/presentation";

export type AdminUserSummary = {
  id: string;
  email: string;
  name: string;
  systemRole: SystemRole;
  hasPassword: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  status: "active" | "pending_deletion";
  deletedAt: string | null;
  purgesAt: string | null;
};

function toSummary(row: {
  id: string;
  email: string;
  name: string;
  systemRole: SystemRole;
  passwordHash: string | null;
  mustChangePassword: boolean;
  createdAt: Date;
  deletedAt: Date | null;
}): AdminUserSummary {
  const deletion = getUserDeletionState(row.deletedAt);

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    systemRole: row.systemRole,
    hasPassword: row.passwordHash !== null,
    mustChangePassword: row.mustChangePassword,
    createdAt: row.createdAt.toISOString(),
    status: deletion.status,
    deletedAt: deletion.deletedAt,
    purgesAt: deletion.purgesAt,
  };
}

const userSelect = {
  id: users.id,
  email: users.email,
  name: users.name,
  systemRole: users.systemRole,
  passwordHash: users.passwordHash,
  mustChangePassword: users.mustChangePassword,
  createdAt: users.createdAt,
  deletedAt: users.deletedAt,
};

export async function listUsers(): Promise<AdminUserSummary[]> {
  await purgeExpiredDeletedUsers();

  const db = getDb();
  const rows = await db
    .select(userSelect)
    .from(users)
    .orderBy(desc(users.createdAt));

  return rows.map(toSummary);
}

export async function createLocalUser(
  actorId: string,
  input: {
    email: string;
    name: string;
    password?: string;
    systemRole?: SystemRole;
  },
): Promise<
  | { user: AdminUserSummary; emailSent: boolean }
  | { error: "email_taken" | "invalid_input" }
> {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();

  if (!email || !name) {
    return { error: "invalid_input" };
  }

  if (await findUserByEmail(email)) {
    return { error: "email_taken" };
  }

  const password = input.password?.trim() || generateBootstrapPassword();
  const mustChangePassword = !input.password?.trim();
  const passwordHash = await hashPassword(password);
  const systemRole = input.systemRole ?? "user";

  const db = getDb();
  const [created] = await db
    .insert(users)
    .values({
      email,
      name,
      passwordHash,
      systemRole,
      mustChangePassword,
    })
    .returning(userSelect);

  if (!created) {
    throw new Error("Failed to create user");
  }

  await writeAuditLog({
    userId: actorId,
    action: "user.create",
    resource: `user:${created.email}`,
  });

  if (mustChangePassword) {
    const emailResult = await sendSetPasswordEmailForUser(created.id);
    return { user: toSummary(created), emailSent: emailResult.emailSent };
  }

  return { user: toSummary(created), emailSent: false };
}

export async function getUserById(userId: string): Promise<AdminUserSummary | null> {
  await purgeExpiredDeletedUsers();

  const db = getDb();
  const [row] = await db
    .select(userSelect)
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return row ? toSummary(row) : null;
}

export async function updateUser(
  actorId: string,
  userId: string,
  input: {
    name?: string;
    email?: string;
    systemRole?: SystemRole;
    password?: string;
  },
): Promise<
  AdminUserSummary | { error: "not_found" | "email_taken" | "invalid_input" | "last_admin" }
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

  const updates: Partial<typeof users.$inferInsert> = {};

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) {
      return { error: "invalid_input" };
    }
    updates.name = name;
  }

  if (input.email !== undefined) {
    const email = input.email.trim().toLowerCase();
    if (!email) {
      return { error: "invalid_input" };
    }

    if (email !== existing.email) {
      const taken = await findUserByEmail(email);
      if (taken && taken.id !== existing.id) {
        return { error: "email_taken" };
      }
      updates.email = email;
    }
  }

  if (input.systemRole !== undefined && input.systemRole !== existing.systemRole) {
    if (existing.systemRole === "admin" && input.systemRole === "user") {
      const { countActiveSystemAdmins } = await import("@/lib/users/lifecycle");
      const remaining = await countActiveSystemAdmins(userId);
      if (remaining === 0) {
        return { error: "last_admin" };
      }
    }
    updates.systemRole = input.systemRole;
  }

  if (input.password !== undefined && existing.passwordHash !== null) {
    const reset = await adminResetUserPassword(actorId, userId, input.password);
    if ("error" in reset) {
      return { error: "not_found" };
    }
  }

  if (Object.keys(updates).length > 0) {
    const [updated] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, userId))
      .returning(userSelect);

    if (!updated) {
      return { error: "not_found" };
    }

    await writeAuditLog({
      userId: actorId,
      action: "user.update",
      resource: `user:${updated.email}`,
    });

    return toSummary(updated);
  }

  const refreshed = await getUserById(userId);
  return refreshed ?? { error: "not_found" };
}

export async function deleteUser(
  actorId: string,
  userId: string,
): Promise<{ ok: true } | { error: "not_found" | "forbidden" | "last_admin" }> {
  const result = await softDeleteUser(actorId, userId);
  if ("error" in result) {
    if (result.error === "not_pending_deletion") {
      return { ok: true };
    }
    return { error: result.error };
  }

  return { ok: true };
}

export async function reactivateAdminUser(
  actorId: string,
  userId: string,
): Promise<{ ok: true } | { error: "not_found" | "not_pending_deletion" }> {
  const user = await getUserById(userId);
  if (!user) {
    return { error: "not_found" };
  }

  if (user.status !== "pending_deletion") {
    return { error: "not_pending_deletion" };
  }

  const result = await reactivateUser(actorId, userId);
  if ("error" in result && result.error === "not_found") {
    return { error: "not_found" };
  }

  return { ok: true };
}
