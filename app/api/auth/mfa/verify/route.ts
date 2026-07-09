// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiError } from "@/lib/api/errors";
import { writeAuditLog } from "@/lib/audit/log";
import { getClientIp } from "@/lib/auth/credentials";
import {
  buildClearMfaPendingCookie,
  getMfaPendingStateFromCookie,
} from "@/lib/mfa/pending";
import { verifyMfaLoginCode } from "@/lib/mfa/store";
import { checkLoginRateLimit } from "@/lib/rate-limit/login";
import { buildSessionCookie } from "@/lib/session/cookie";
import { createSession } from "@/lib/session/store";
import { getUserDeletionState } from "@/lib/users/presentation";
import { toAuthUser } from "@/lib/users/serialize";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

type VerifyMfaBody = {
  code?: string;
};

export async function POST(request: NextRequest) {
  const pending = getMfaPendingStateFromCookie(request.headers.get("cookie"));
  if (!pending) {
    return apiError("mfa_not_pending", "MFA challenge is missing or expired", 401);
  }

  let body: VerifyMfaBody;
  try {
    body = (await request.json()) as VerifyMfaBody;
  } catch {
    return apiError("bad_request", "Invalid JSON body", 400);
  }

  const code = body.code?.trim();
  if (!code) {
    return apiError("bad_request", "Verification code is required", 400);
  }

  const clientIp = getClientIp(request);
  if (!checkLoginRateLimit(clientIp, `mfa:${pending.userId}`)) {
    return apiError("rate_limited", "Too many MFA attempts", 429);
  }

  const verification = await verifyMfaLoginCode(pending.userId, code);
  if (!verification) {
    await writeAuditLog({
      userId: pending.userId,
      action: "auth.mfa_failed",
      resource: `user:${pending.userId}`,
      clientIp,
    });
    return apiError("mfa_invalid", "Invalid verification code", 401);
  }

  const db = getDb();
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, pending.userId))
    .limit(1);

  if (!user) {
    return apiError("mfa_not_pending", "MFA challenge is missing or expired", 401);
  }

  const sessionId = await createSession(user.id);
  const deletion = getUserDeletionState(user.deletedAt);

  await writeAuditLog({
    userId: user.id,
    action: "auth.mfa_login",
    resource: `user:${user.email}`,
    clientIp,
    metadata: { method: verification },
  });

  const response = NextResponse.json({
    user: toAuthUser({
      id: user.id,
      email: user.email,
      name: user.name,
      systemRole: user.systemRole,
      mustChangePassword: user.mustChangePassword,
      hasPassword: user.passwordHash !== null,
      mfaEnabled: user.totpEnabledAt !== null,
      pendingDeletion: deletion.pendingDeletion,
      deletedAt: deletion.deletedAt,
      purgesAt: deletion.purgesAt,
    }),
  });
  response.headers.append("Set-Cookie", buildSessionCookie(sessionId));
  response.headers.append("Set-Cookie", buildClearMfaPendingCookie());
  return response;
}
