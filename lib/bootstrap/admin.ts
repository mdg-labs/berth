// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { randomBytes } from "node:crypto";

import { hash } from "bcryptjs";
import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";

export const BOOTSTRAP_PASSWORD_BANNER_START =
  "=== BOOTSTRAP ADMIN PASSWORD (shown once) ===";
export const BOOTSTRAP_PASSWORD_BANNER_END =
  "=== END BOOTSTRAP ADMIN PASSWORD ===";

const DEFAULT_BOOTSTRAP_EMAIL = "admin@localhost";
const BCRYPT_ROUNDS = 12;

export function resolveBootstrapEmail(): string {
  return process.env.BOOTSTRAP_ADMIN_EMAIL?.trim() || DEFAULT_BOOTSTRAP_EMAIL;
}

export function generateBootstrapPassword(length = 24): string {
  return randomBytes(length).toString("base64url").slice(0, length);
}

export function logGeneratedBootstrapPassword(password: string): void {
  console.log(BOOTSTRAP_PASSWORD_BANNER_START);
  console.log(`Email: ${resolveBootstrapEmail()}`);
  console.log(`Password: ${password}`);
  console.log(BOOTSTRAP_PASSWORD_BANNER_END);
}

export async function hasAdminUser(): Promise<boolean> {
  const db = getDb();
  const [admin] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.systemRole, "admin"))
    .limit(1);

  return Boolean(admin);
}

export type BootstrapAdminResult = {
  created: boolean;
  passwordLogged: boolean;
};

export async function ensureBootstrapAdmin(): Promise<BootstrapAdminResult> {
  const configuredPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD?.trim();

  if (await hasAdminUser()) {
    if (configuredPassword) {
      const db = getDb();
      const passwordHash = await hash(configuredPassword, BCRYPT_ROUNDS);
      await db
        .update(users)
        .set({
          passwordHash,
          mustChangePassword: false,
        })
        .where(eq(users.email, resolveBootstrapEmail()));
    }

    return { created: false, passwordLogged: false };
  }

  const password = configuredPassword || generateBootstrapPassword();
  const passwordLogged = !configuredPassword;

  if (passwordLogged) {
    logGeneratedBootstrapPassword(password);
  }

  const db = getDb();
  const passwordHash = await hash(password, BCRYPT_ROUNDS);

  await db.insert(users).values({
    email: resolveBootstrapEmail(),
    name: "Bootstrap Admin",
    passwordHash,
    systemRole: "admin",
    mustChangePassword: passwordLogged,
  });

  return { created: true, passwordLogged };
}
