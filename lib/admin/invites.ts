// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { and, eq, isNull } from "drizzle-orm";

import { writeAuditLog } from "@/lib/audit/log";
import { findUserByEmail, hashPassword } from "@/lib/auth/credentials";
import { getDb } from "@/lib/db";
import { userInvites, users } from "@/lib/db/schema";
import { getUserInviteTtlHours } from "@/lib/email/config";
import { trySendEmail } from "@/lib/email/send";
import { buildUserInviteUrl, userInviteEmail } from "@/lib/email/templates";
import type { Locale } from "@/lib/i18n/config";
import {
  generateToken,
  getExpiryFromHours,
  hashToken,
  isTokenExpired,
} from "@/lib/email/tokens";
import type { SystemRole } from "@/lib/rbac/types";

export type UserInviteSummary = {
  id: string;
  email: string;
  name: string;
  systemRole: SystemRole;
  invitedAt: string;
  expiresAt: string;
  acceptedAt: string | null;
};

export type UserInviteValidation =
  | {
      valid: true;
      email: string;
      name: string;
      systemRole: SystemRole;
    }
  | { valid: false; reason: "invalid" | "expired" | "accepted" };

function toSummary(row: {
  id: string;
  email: string;
  name: string;
  systemRole: SystemRole;
  createdAt: Date;
  expiresAt: Date;
  acceptedAt: Date | null;
}): UserInviteSummary {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    systemRole: row.systemRole,
    invitedAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
  };
}

async function findPendingInviteByEmail(email: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(userInvites)
    .where(and(eq(userInvites.email, email), isNull(userInvites.acceptedAt)))
    .limit(1);
  return row ?? null;
}

export async function listPendingUserInvites(): Promise<UserInviteSummary[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(userInvites)
    .where(isNull(userInvites.acceptedAt));

  return rows.map(toSummary);
}

export async function createUserInvite(
  actorId: string,
  input: {
    email: string;
    name: string;
    systemRole?: SystemRole;
    locale?: Locale;
  },
): Promise<
  | { invite: UserInviteSummary; emailSent: boolean; rawToken: string }
  | { error: "email_taken" | "invite_pending" | "invalid_input" }
> {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  const systemRole = input.systemRole ?? "user";

  if (!email || !name) {
    return { error: "invalid_input" };
  }

  if (await findUserByEmail(email)) {
    return { error: "email_taken" };
  }

  if (await findPendingInviteByEmail(email)) {
    return { error: "invite_pending" };
  }

  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = getExpiryFromHours(getUserInviteTtlHours());

  const db = getDb();
  const [created] = await db
    .insert(userInvites)
    .values({
      email,
      name,
      systemRole,
      tokenHash,
      invitedBy: actorId,
      expiresAt,
    })
    .returning();

  if (!created) {
    throw new Error("Failed to create user invite");
  }

  const sendResult = await trySendEmail(
    await userInviteEmail({
      to: email,
      inviteeName: name,
      inviteUrl: buildUserInviteUrl(rawToken),
      locale: input.locale,
    }),
  );

  await writeAuditLog({
    userId: actorId,
    action: "user.invite",
    resource: `user:${email}`,
  });

  return {
    invite: toSummary(created),
    emailSent: sendResult.sent,
    rawToken,
  };
}

export async function resendUserInvite(
  actorId: string,
  inviteId: string,
  locale: Locale = "en",
): Promise<
  | { invite: UserInviteSummary; emailSent: boolean }
  | { error: "not_found" | "accepted" | "expired" }
> {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(userInvites)
    .where(eq(userInvites.id, inviteId))
    .limit(1);

  if (!existing) {
    return { error: "not_found" };
  }

  if (existing.acceptedAt) {
    return { error: "accepted" };
  }

  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = getExpiryFromHours(getUserInviteTtlHours());

  const [updated] = await db
    .update(userInvites)
    .set({
      tokenHash,
      expiresAt,
    })
    .where(eq(userInvites.id, inviteId))
    .returning();

  if (!updated) {
    return { error: "not_found" };
  }

  const sendResult = await trySendEmail(
    await userInviteEmail({
      to: updated.email,
      inviteeName: updated.name,
      inviteUrl: buildUserInviteUrl(rawToken),
      locale,
    }),
  );

  await writeAuditLog({
    userId: actorId,
    action: "user.invite.resend",
    resource: `user:${updated.email}`,
  });

  return {
    invite: toSummary(updated),
    emailSent: sendResult.sent,
  };
}

export async function validateUserInvite(
  rawToken: string,
): Promise<UserInviteValidation> {
  const tokenHash = hashToken(rawToken);
  const db = getDb();
  const [row] = await db
    .select()
    .from(userInvites)
    .where(eq(userInvites.tokenHash, tokenHash))
    .limit(1);

  if (!row) {
    return { valid: false, reason: "invalid" };
  }

  if (row.acceptedAt) {
    return { valid: false, reason: "accepted" };
  }

  if (isTokenExpired(row.expiresAt)) {
    return { valid: false, reason: "expired" };
  }

  return {
    valid: true,
    email: row.email,
    name: row.name,
    systemRole: row.systemRole,
  };
}

export async function acceptUserInvite(
  rawToken: string,
  password: string,
): Promise<
  | { ok: true; userId: string }
  | { error: "invalid" | "expired" | "accepted" | "invalid_input" | "email_taken" }
> {
  const trimmed = password.trim();
  if (trimmed.length < 8) {
    return { error: "invalid_input" };
  }

  const validation = await validateUserInvite(rawToken);
  if (!validation.valid) {
    return { error: validation.reason };
  }

  if (await findUserByEmail(validation.email)) {
    return { error: "email_taken" };
  }

  const tokenHash = hashToken(rawToken);
  const db = getDb();
  const [invite] = await db
    .select()
    .from(userInvites)
    .where(eq(userInvites.tokenHash, tokenHash))
    .limit(1);

  if (!invite || invite.acceptedAt || isTokenExpired(invite.expiresAt)) {
    return { error: "invalid" };
  }

  const passwordHash = await hashPassword(trimmed);
  const [created] = await db
    .insert(users)
    .values({
      email: invite.email,
      name: invite.name,
      passwordHash,
      systemRole: invite.systemRole,
      mustChangePassword: false,
    })
    .returning({ id: users.id });

  if (!created) {
    throw new Error("Failed to create invited user");
  }

  await db
    .update(userInvites)
    .set({ acceptedAt: new Date() })
    .where(eq(userInvites.id, invite.id));

  await writeAuditLog({
    userId: created.id,
    action: "user.invite.accept",
    resource: `user:${invite.email}`,
  });

  return { ok: true, userId: created.id };
}
