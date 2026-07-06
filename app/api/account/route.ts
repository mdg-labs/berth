// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiError } from "@/lib/api/errors";
import { getAccountUserById, updateAccount } from "@/lib/users/account";
import { toAuthUser } from "@/lib/users/serialize";
import { getSessionUserFromRequest } from "@/lib/session/request";

type UpdateAccountBody = {
  name?: string;
  email?: string;
  currentPassword?: string;
};

export async function GET(request: NextRequest) {
  const sessionUser = await getSessionUserFromRequest(request);
  if (!sessionUser) {
    return apiError("not_authenticated", "Not authenticated", 401);
  }

  const user = await getAccountUserById(sessionUser.id);
  if (!user) {
    return apiError("not_authenticated", "Not authenticated", 401);
  }

  return NextResponse.json({ user: toAuthUser(user) });
}

export async function PATCH(request: NextRequest) {
  const sessionUser = await getSessionUserFromRequest(request);
  if (!sessionUser) {
    return apiError("not_authenticated", "Not authenticated", 401);
  }

  let body: UpdateAccountBody;
  try {
    body = (await request.json()) as UpdateAccountBody;
  } catch {
    return apiError("bad_request", "Invalid JSON body", 400);
  }

  const result = await updateAccount(sessionUser.id, body);
  if ("error" in result) {
    if (result.error === "not_found") {
      return apiError("not_authenticated", "Not authenticated", 401);
    }
    if (result.error === "forbidden") {
      return apiError(
        "forbidden",
        "OIDC accounts cannot be updated from the portal",
        403,
      );
    }
    if (result.error === "email_taken") {
      return apiError("conflict", "Email is already in use", 409);
    }
    return apiError("bad_request", "Current password is incorrect", 400);
  }

  return NextResponse.json({ user: toAuthUser(result) });
}
