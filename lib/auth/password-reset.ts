// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { and, eq, isNull } from "drizzle-orm";

import { writeAuditLog } from "@/lib/audit/log";
import { findUserByEmail, hashPassword } from "@/lib/auth/credentials";
import { clearMfaForUser } from "@/lib/mfa/store";
import type { Locale } from "@/lib/i18n/config";
import { getDb } from "@/lib/db";
import { passwordResetTokens, users } from "@/lib/db/schema";
import { getPasswordResetTtlHours } from "@/lib/email/config";
import { trySendEmail, toEmailDeliveryStatus } from "@/lib/email/send";
import type { EmailDeliveryStatus } from "@/lib/email/send";
import {
  buildPasswordResetUrl,
  passwordResetEmail,
} from "@/lib/email/templates";
import {
  generateToken,
  getExpiryFromHours,
  hashToken,
  isTokenExpired,
} from "@/lib/email/tokens";

export type PasswordResetValidation =
  | { valid: true; email: string }
  | { valid: false; reason: "invalid" | "expired" | "used" };

async function invalidateExistingTokens(userId: string): Promise<void> {
  const db = getDb();
  await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(passwordResetTokens.userId, userId),
        isNull(passwordResetTokens.usedAt),
      ),
    );
}

export async function requestPasswordReset(
  email: string,
  locale: Locale = "en",
): Promise<{ emailSent: boolean }> {
  const user = await findUserByEmail(email);
  if (!user || !user.passwordHash) {
    return { emailSent: false };
  }

  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = getExpiryFromHours(getPasswordResetTtlHours());

  await invalidateExistingTokens(user.id);

  const db = getDb();
  await db.insert(passwordResetTokens).values({
    userId: user.id,
    tokenHash,
    expiresAt,
  });

  const result = await trySendEmail(
    await passwordResetEmail({
      to: user.email,
      resetUrl: buildPasswordResetUrl(rawToken),
      locale,
    }),
  );

  if (!result.sent && result.reason === "not_configured") {
    console.warn(
      `Password reset requested for ${user.email} but SMTP is not configured`,
    );
  }

  return { emailSent: result.sent };
}

export async function validatePasswordResetToken(
  rawToken: string,
): Promise<PasswordResetValidation> {
  const tokenHash = hashToken(rawToken);
  const db = getDb();
  const [row] = await db
    .select({
      usedAt: passwordResetTokens.usedAt,
      expiresAt: passwordResetTokens.expiresAt,
      email: users.email,
    })
    .from(passwordResetTokens)
    .innerJoin(users, eq(passwordResetTokens.userId, users.id))
    .where(eq(passwordResetTokens.tokenHash, tokenHash))
    .limit(1);

  if (!row) {
    return { valid: false, reason: "invalid" };
  }

  if (row.usedAt) {
    return { valid: false, reason: "used" };
  }

  if (isTokenExpired(row.expiresAt)) {
    return { valid: false, reason: "expired" };
  }

  return { valid: true, email: row.email };
}

export async function completePasswordReset(
  rawToken: string,
  newPassword: string,
): Promise<{ ok: true } | { error: "invalid" | "expired" | "used" | "invalid_input" }> {
  const trimmed = newPassword.trim();
  if (trimmed.length < 8) {
    return { error: "invalid_input" };
  }

  const validation = await validatePasswordResetToken(rawToken);
  if (!validation.valid) {
    return { error: validation.reason };
  }

  const tokenHash = hashToken(rawToken);
  const db = getDb();
  const [row] = await db
    .select({
      id: passwordResetTokens.id,
      userId: passwordResetTokens.userId,
      usedAt: passwordResetTokens.usedAt,
      expiresAt: passwordResetTokens.expiresAt,
    })
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.tokenHash, tokenHash))
    .limit(1);

  if (!row || row.usedAt || isTokenExpired(row.expiresAt)) {
    return { error: "invalid" };
  }

  const passwordHash = await hashPassword(trimmed);
  await db
    .update(users)
    .set({
      passwordHash,
      mustChangePassword: false,
    })
    .where(eq(users.id, row.userId));

  await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(eq(passwordResetTokens.id, row.id));

  await clearMfaForUser(row.userId);

  const [user] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, row.userId))
    .limit(1);

  await writeAuditLog({
    userId: row.userId,
    action: "auth.password_reset",
    resource: `user:${user?.email ?? row.userId}`,
  });

  return { ok: true };
}

export async function sendSetPasswordEmailForUser(
  userId: string,
  locale: Locale = "en",
): Promise<{ emailStatus: EmailDeliveryStatus }> {
  const db = getDb();
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      passwordHash: users.passwordHash,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user || !user.passwordHash) {
    return { emailStatus: "not_configured" };
  }

  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = getExpiryFromHours(getPasswordResetTtlHours());

  await invalidateExistingTokens(user.id);
  await db.insert(passwordResetTokens).values({
    userId: user.id,
    tokenHash,
    expiresAt,
  });

  const result = await trySendEmail(
    await passwordResetEmail({
      to: user.email,
      resetUrl: buildPasswordResetUrl(rawToken),
      locale,
    }),
  );

  return { emailStatus: toEmailDeliveryStatus(result) };
}
