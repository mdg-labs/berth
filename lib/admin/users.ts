// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { desc, eq } from "drizzle-orm";

import { writeAuditLog } from "@/lib/audit/log";
import { findUserByEmail, hashPassword } from "@/lib/auth/credentials";
import { generateBootstrapPassword } from "@/lib/bootstrap/admin";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import type { SystemRole } from "@/lib/rbac/types";

export type AdminUserSummary = {
  id: string;
  email: string;
  name: string;
  systemRole: SystemRole;
  hasPassword: boolean;
  mustChangePassword: boolean;
  createdAt: string;
};

function toSummary(row: {
  id: string;
  email: string;
  name: string;
  systemRole: SystemRole;
  passwordHash: string | null;
  mustChangePassword: boolean;
  createdAt: Date;
}): AdminUserSummary {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    systemRole: row.systemRole,
    hasPassword: row.passwordHash !== null,
    mustChangePassword: row.mustChangePassword,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listUsers(): Promise<AdminUserSummary[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      systemRole: users.systemRole,
      passwordHash: users.passwordHash,
      mustChangePassword: users.mustChangePassword,
      createdAt: users.createdAt,
    })
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
): Promise<AdminUserSummary | { error: "email_taken" | "invalid_input" }> {
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
    .returning({
      id: users.id,
      email: users.email,
      name: users.name,
      systemRole: users.systemRole,
      passwordHash: users.passwordHash,
      mustChangePassword: users.mustChangePassword,
      createdAt: users.createdAt,
    });

  if (!created) {
    throw new Error("Failed to create user");
  }

  await writeAuditLog({
    userId: actorId,
    action: "user.create",
    resource: `user:${created.email}`,
  });

  return toSummary(created);
}

export async function getUserById(userId: string): Promise<AdminUserSummary | null> {
  const db = getDb();
  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      systemRole: users.systemRole,
      passwordHash: users.passwordHash,
      mustChangePassword: users.mustChangePassword,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return row ? toSummary(row) : null;
}
