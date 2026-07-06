// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { compare, hash } from "bcryptjs";
import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import {
  hardDeleteUser,
  purgeExpiredDeletedUsers,
  resolveUserForAuthentication,
} from "@/lib/users/lifecycle";

export async function findUserByEmail(email: string) {
  await purgeExpiredDeletedUsers();

  const db = getDb();
  const normalizedEmail = email.trim().toLowerCase();

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (!user) {
    return null;
  }

  const authState = await resolveUserForAuthentication(user);
  if (authState === "purged") {
    return null;
  }

  return user;
}

export async function verifyPassword(
  passwordHash: string | null,
  password: string,
): Promise<boolean> {
  if (!passwordHash) {
    return false;
  }

  return compare(password, passwordHash);
}

const BCRYPT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return hash(password, BCRYPT_ROUNDS);
}

export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }

  return request.headers.get("x-real-ip") ?? "unknown";
}
