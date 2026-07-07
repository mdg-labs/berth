// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { createUserInvite } from "@/lib/admin/invites";
import { isSessionSystemAdmin } from "@/lib/admin/guard";
import { apiError } from "@/lib/api/errors";
import { getLocaleFromRequest } from "@/lib/i18n/request-locale";
import type { SystemRole } from "@/lib/rbac/types";
import { getSessionUserFromRequest } from "@/lib/session/request";

type CreateInviteBody = {
  email?: string;
  name?: string;
  systemRole?: SystemRole;
};

export async function POST(request: NextRequest) {
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return apiError("not_authenticated", "Not authenticated", 401);
  }

  if (!isSessionSystemAdmin(user)) {
    return apiError("forbidden", "System admin required", 403);
  }

  let body: CreateInviteBody;
  try {
    body = (await request.json()) as CreateInviteBody;
  } catch {
    return apiError("bad_request", "Invalid JSON body", 400);
  }

  if (!body.email?.trim() || !body.name?.trim()) {
    return apiError("bad_request", "Email and name are required", 400);
  }

  if (body.systemRole && body.systemRole !== "admin" && body.systemRole !== "user") {
    return apiError("bad_request", "Invalid system role", 400);
  }

  const result = await createUserInvite(user.id, {
    email: body.email,
    name: body.name,
    systemRole: body.systemRole,
    locale: getLocaleFromRequest(request),
  });

  if ("error" in result) {
    if (result.error === "email_taken") {
      return apiError("conflict", "A user with this email already exists", 409);
    }
    if (result.error === "invite_pending") {
      return apiError("conflict", "A pending invite already exists for this email", 409);
    }
    return apiError("bad_request", "Invalid invite input", 400);
  }

  return NextResponse.json(
    {
      invite: result.invite,
      emailSent: result.emailSent,
    },
    { status: 201 },
  );
}
