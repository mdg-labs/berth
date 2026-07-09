// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiError } from "@/lib/api/errors";
import { startMfaSetup } from "@/lib/mfa/store";
import { getSessionUserFromRequest } from "@/lib/session/request";

export async function POST(request: NextRequest) {
  const sessionUser = await getSessionUserFromRequest(request);
  if (!sessionUser) {
    return apiError("not_authenticated", "Not authenticated", 401);
  }

  if (!sessionUser.hasPassword) {
    return apiError("forbidden", "MFA is only available for password accounts", 403);
  }

  const result = await startMfaSetup(sessionUser.id);
  if ("error" in result) {
    if (result.error === "already_enabled") {
      return apiError("conflict", "MFA is already enabled", 409);
    }
    return apiError("not_found", "User not found", 404);
  }

  return NextResponse.json(result);
}
