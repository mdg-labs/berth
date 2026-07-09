// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiError } from "@/lib/api/errors";
import { writeAuditLog } from "@/lib/audit/log";
import { getClientIp } from "@/lib/auth/credentials";
import { disableMfa, getMfaStatus } from "@/lib/mfa/store";
import { getSessionUserFromRequest } from "@/lib/session/request";

type DisableMfaBody = {
  password?: string;
  code?: string;
};

export async function GET(request: NextRequest) {
  const sessionUser = await getSessionUserFromRequest(request);
  if (!sessionUser) {
    return apiError("not_authenticated", "Not authenticated", 401);
  }

  if (!sessionUser.hasPassword) {
    return apiError("forbidden", "MFA is only available for password accounts", 403);
  }

  const status = await getMfaStatus(sessionUser.id);
  if (!status) {
    return apiError("not_found", "User not found", 404);
  }

  return NextResponse.json(status);
}

export async function DELETE(request: NextRequest) {
  const sessionUser = await getSessionUserFromRequest(request);
  if (!sessionUser) {
    return apiError("not_authenticated", "Not authenticated", 401);
  }

  if (!sessionUser.hasPassword) {
    return apiError("forbidden", "MFA is only available for password accounts", 403);
  }

  let body: DisableMfaBody;
  try {
    body = (await request.json()) as DisableMfaBody;
  } catch {
    return apiError("bad_request", "Invalid JSON body", 400);
  }

  const password = body.password;
  const code = body.code?.trim();

  if (!password || !code) {
    return apiError("bad_request", "Password and verification code are required", 400);
  }

  const result = await disableMfa(sessionUser.id, password, code);
  if ("error" in result) {
    if (result.error === "invalid_password") {
      return apiError("invalid_credentials", "Current password is incorrect", 401);
    }
    if (result.error === "invalid_code") {
      return apiError("mfa_invalid", "Invalid verification code", 401);
    }
    if (result.error === "not_enabled") {
      return apiError("bad_request", "MFA is not enabled", 400);
    }
    return apiError("not_found", "User not found", 404);
  }

  await writeAuditLog({
    userId: sessionUser.id,
    action: "auth.mfa_disabled",
    resource: `user:${sessionUser.email}`,
    clientIp: getClientIp(request),
  });

  return NextResponse.json({ ok: true });
}
