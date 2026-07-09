// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { eq } from "drizzle-orm";

import { verifyPassword } from "@/lib/auth/credentials";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";

import {
  deleteBackupCodesForUser,
  replaceBackupCodesForUser,
  verifyAndConsumeBackupCode,
} from "./backup-codes";
import { decryptTotpSecret, encryptTotpSecret } from "./crypto";
import {
  buildOtpAuthUri,
  buildQrDataUrl,
  createTotpSecret,
  verifyTotpCode,
} from "./totp";
import { getMfaIssuer } from "./config";

export type MfaStatus = {
  enabled: boolean;
  pendingSetup: boolean;
};

export async function getMfaStatus(userId: string): Promise<MfaStatus | null> {
  const db = getDb();
  const [row] = await db
    .select({
      totpSecretEnc: users.totpSecretEnc,
      totpEnabledAt: users.totpEnabledAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!row) {
    return null;
  }

  return {
    enabled: row.totpEnabledAt !== null,
    pendingSetup: row.totpSecretEnc !== null && row.totpEnabledAt === null,
  };
}

export async function isMfaEnabledForUser(userId: string): Promise<boolean> {
  const status = await getMfaStatus(userId);
  return status?.enabled ?? false;
}

export async function isMfaEnabledForUserByEmail(
  email: string,
): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ totpEnabledAt: users.totpEnabledAt })
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()))
    .limit(1);

  return row?.totpEnabledAt !== null && row?.totpEnabledAt !== undefined;
}

export async function startMfaSetup(userId: string): Promise<
  | {
      qrDataUrl: string;
      secret: string;
      issuer: string;
      accountName: string;
    }
  | { error: "not_found" | "already_enabled" }
> {
  const db = getDb();
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      totpEnabledAt: users.totpEnabledAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    return { error: "not_found" };
  }

  if (user.totpEnabledAt) {
    return { error: "already_enabled" };
  }

  const secret = createTotpSecret();
  const totpSecretEnc = encryptTotpSecret(secret);
  const issuer = getMfaIssuer();
  const otpauthUri = buildOtpAuthUri({
    secret,
    accountName: user.email,
  });
  const qrDataUrl = await buildQrDataUrl(otpauthUri);

  await db
    .update(users)
    .set({
      totpSecretEnc,
      totpEnabledAt: null,
    })
    .where(eq(users.id, userId));

  return {
    qrDataUrl,
    secret,
    issuer,
    accountName: user.email,
  };
}

export async function confirmMfaSetup(
  userId: string,
  code: string,
): Promise<
  | { backupCodes: string[] }
  | { error: "not_found" | "not_pending" | "invalid_code" }
> {
  const db = getDb();
  const [user] = await db
    .select({
      id: users.id,
      totpSecretEnc: users.totpSecretEnc,
      totpEnabledAt: users.totpEnabledAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    return { error: "not_found" };
  }

  if (!user.totpSecretEnc || user.totpEnabledAt) {
    return { error: "not_pending" };
  }

  const secret = decryptTotpSecret(user.totpSecretEnc);
  if (!(await verifyTotpCode(secret, code))) {
    return { error: "invalid_code" };
  }

  await db
    .update(users)
    .set({ totpEnabledAt: new Date() })
    .where(eq(users.id, userId));

  const backupCodes = await replaceBackupCodesForUser(userId);
  return { backupCodes };
}

export async function disableMfa(
  userId: string,
  password: string,
  code: string,
): Promise<
  | { ok: true }
  | { error: "not_found" | "not_enabled" | "invalid_password" | "invalid_code" }
> {
  const db = getDb();
  const [user] = await db
    .select({
      id: users.id,
      passwordHash: users.passwordHash,
      totpSecretEnc: users.totpSecretEnc,
      totpEnabledAt: users.totpEnabledAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    return { error: "not_found" };
  }

  if (!user.totpEnabledAt || !user.totpSecretEnc) {
    return { error: "not_enabled" };
  }

  if (!(await verifyPassword(user.passwordHash, password))) {
    return { error: "invalid_password" };
  }

  const secret = decryptTotpSecret(user.totpSecretEnc);
  if (!(await verifyTotpCode(secret, code))) {
    return { error: "invalid_code" };
  }

  await clearMfaForUser(userId);
  return { ok: true };
}

export async function regenerateBackupCodes(
  userId: string,
  password: string,
  code: string,
): Promise<
  | { backupCodes: string[] }
  | { error: "not_found" | "not_enabled" | "invalid_password" | "invalid_code" }
> {
  const db = getDb();
  const [user] = await db
    .select({
      id: users.id,
      passwordHash: users.passwordHash,
      totpSecretEnc: users.totpSecretEnc,
      totpEnabledAt: users.totpEnabledAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    return { error: "not_found" };
  }

  if (!user.totpEnabledAt || !user.totpSecretEnc) {
    return { error: "not_enabled" };
  }

  if (!(await verifyPassword(user.passwordHash, password))) {
    return { error: "invalid_password" };
  }

  const secret = decryptTotpSecret(user.totpSecretEnc);
  if (!(await verifyTotpCode(secret, code))) {
    return { error: "invalid_code" };
  }

  const backupCodes = await replaceBackupCodesForUser(userId);
  return { backupCodes };
}

export async function verifyMfaLoginCode(
  userId: string,
  code: string,
): Promise<"totp" | "backup" | null> {
  const db = getDb();
  const [user] = await db
    .select({
      totpSecretEnc: users.totpSecretEnc,
      totpEnabledAt: users.totpEnabledAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user?.totpEnabledAt || !user.totpSecretEnc) {
    return null;
  }

  const secret = decryptTotpSecret(user.totpSecretEnc);
  if (await verifyTotpCode(secret, code)) {
    return "totp";
  }

  if (await verifyAndConsumeBackupCode(userId, code)) {
    return "backup";
  }

  return null;
}

export async function clearMfaForUser(userId: string): Promise<void> {
  const db = getDb();
  await db
    .update(users)
    .set({
      totpSecretEnc: null,
      totpEnabledAt: null,
    })
    .where(eq(users.id, userId));

  await deleteBackupCodesForUser(userId);
}

export async function getUserMfaEnabledAt(
  userId: string,
): Promise<Date | null> {
  const db = getDb();
  const [row] = await db
    .select({ totpEnabledAt: users.totpEnabledAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return row?.totpEnabledAt ?? null;
}
