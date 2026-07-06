// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiError } from "@/lib/api/errors";
import { getSessionUserFromRequest } from "@/lib/session/request";
import { reactivateOwnAccount } from "@/lib/users/account";
import { toAuthUser } from "@/lib/users/serialize";

export async function POST(request: NextRequest) {
  const sessionUser = await getSessionUserFromRequest(request);
  if (!sessionUser) {
    return apiError("not_authenticated", "Not authenticated", 401);
  }

  const result = await reactivateOwnAccount(sessionUser.id);
  if ("error" in result) {
    if (result.error === "not_found") {
      return apiError("not_found", "Account not found", 404);
    }
    return apiError("bad_request", "Account is not pending deletion", 400);
  }

  return NextResponse.json({ user: toAuthUser(result) });
}
