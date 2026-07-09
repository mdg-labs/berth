// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { and, eq, isNull } from "drizzle-orm";

import { hashToken } from "@/lib/email/tokens";
import { getDb } from "@/lib/db";
import { mfaBackupCodes } from "@/lib/db/schema";

import { MFA_BACKUP_CODE_COUNT } from "./config";
import { generateBackupCodes } from "./totp";

export function normalizeBackupCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

export function hashBackupCode(code: string): string {
  return hashToken(normalizeBackupCode(code));
}

export async function replaceBackupCodesForUser(
  userId: string,
): Promise<string[]> {
  const db = getDb();
  const codes = generateBackupCodes(MFA_BACKUP_CODE_COUNT);

  await db.delete(mfaBackupCodes).where(eq(mfaBackupCodes.userId, userId));

  await db.insert(mfaBackupCodes).values(
    codes.map((code) => ({
      userId,
      codeHash: hashBackupCode(code),
    })),
  );

  return codes;
}

export async function deleteBackupCodesForUser(userId: string): Promise<void> {
  const db = getDb();
  await db.delete(mfaBackupCodes).where(eq(mfaBackupCodes.userId, userId));
}

export async function verifyAndConsumeBackupCode(
  userId: string,
  code: string,
): Promise<boolean> {
  const normalized = normalizeBackupCode(code);
  if (!/^[0-9A-F]{4}-[0-9A-F]{4}$/.test(normalized)) {
    return false;
  }

  const codeHash = hashBackupCode(normalized);
  const db = getDb();
  const [row] = await db
    .select({ id: mfaBackupCodes.id })
    .from(mfaBackupCodes)
    .where(
      and(
        eq(mfaBackupCodes.userId, userId),
        eq(mfaBackupCodes.codeHash, codeHash),
        isNull(mfaBackupCodes.usedAt),
      ),
    )
    .limit(1);

  if (!row) {
    return false;
  }

  await db
    .update(mfaBackupCodes)
    .set({ usedAt: new Date() })
    .where(eq(mfaBackupCodes.id, row.id));

  return true;
}
