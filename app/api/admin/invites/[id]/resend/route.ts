// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { resendUserInvite } from "@/lib/admin/invites";
import { isSessionSystemAdmin } from "@/lib/admin/guard";
import { apiError } from "@/lib/api/errors";
import { getSessionUserFromRequest } from "@/lib/session/request";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return apiError("not_authenticated", "Not authenticated", 401);
  }

  if (!isSessionSystemAdmin(user)) {
    return apiError("forbidden", "System admin required", 403);
  }

  const { id } = await context.params;
  const result = await resendUserInvite(user.id, id);

  if ("error" in result) {
    if (result.error === "not_found") {
      return apiError("not_found", "Invite not found", 404);
    }
    if (result.error === "accepted") {
      return apiError("bad_request", "Invite has already been accepted", 400);
    }
    return apiError("bad_request", "Invite has expired", 400);
  }

  return NextResponse.json({
    invite: result.invite,
    emailSent: result.emailSent,
  });
}
