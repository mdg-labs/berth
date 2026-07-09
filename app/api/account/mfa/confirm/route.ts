// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiError } from "@/lib/api/errors";
import { writeAuditLog } from "@/lib/audit/log";
import { getClientIp } from "@/lib/auth/credentials";
import { confirmMfaSetup } from "@/lib/mfa/store";
import { getSessionUserFromRequest } from "@/lib/session/request";

type ConfirmMfaBody = {
  code?: string;
};

export async function POST(request: NextRequest) {
  const sessionUser = await getSessionUserFromRequest(request);
  if (!sessionUser) {
    return apiError("not_authenticated", "Not authenticated", 401);
  }

  if (!sessionUser.hasPassword) {
    return apiError("forbidden", "MFA is only available for password accounts", 403);
  }

  let body: ConfirmMfaBody;
  try {
    body = (await request.json()) as ConfirmMfaBody;
  } catch {
    return apiError("bad_request", "Invalid JSON body", 400);
  }

  const code = body.code?.trim();
  if (!code) {
    return apiError("bad_request", "Verification code is required", 400);
  }

  const result = await confirmMfaSetup(sessionUser.id, code);
  if ("error" in result) {
    if (result.error === "invalid_code") {
      return apiError("mfa_invalid", "Invalid verification code", 401);
    }
    if (result.error === "not_pending") {
      return apiError("bad_request", "MFA setup has not been started", 400);
    }
    return apiError("not_found", "User not found", 404);
  }

  await writeAuditLog({
    userId: sessionUser.id,
    action: "auth.mfa_enabled",
    resource: `user:${sessionUser.email}`,
    clientIp: getClientIp(request),
  });

  return NextResponse.json({ backupCodes: result.backupCodes });
}
