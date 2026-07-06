// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiError } from "@/lib/api/errors";
import {
  removeProjectMember,
  updateProjectMemberRole,
} from "@/lib/members/service";
import type { ProjectRole } from "@/lib/rbac/types";
import { getSessionUserFromRequest } from "@/lib/session/request";

type RouteContext = {
  params: Promise<{ id: string; userId: string }>;
};

type UpdateMemberBody = {
  role?: ProjectRole;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return apiError("not_authenticated", "Not authenticated", 401);
  }

  const { id, userId } = await context.params;

  let body: UpdateMemberBody;
  try {
    body = (await request.json()) as UpdateMemberBody;
  } catch {
    return apiError("bad_request", "Invalid JSON body", 400);
  }

  if (!body.role) {
    return apiError("bad_request", "Role is required", 400);
  }

  const result = await updateProjectMemberRole(
    id,
    userId,
    user.id,
    user.systemRole,
    body.role,
  );

  if ("error" in result) {
    if (result.error === "not_found") {
      return apiError("not_found", "Member not found", 404);
    }
    if (result.error === "forbidden") {
      return apiError("forbidden", "Insufficient permissions", 403);
    }
    return apiError("bad_request", "Invalid member role", 400);
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return apiError("not_authenticated", "Not authenticated", 401);
  }

  const { id, userId } = await context.params;

  const result = await removeProjectMember(
    id,
    userId,
    user.id,
    user.systemRole,
  );

  if ("error" in result) {
    if (result.error === "not_found") {
      return apiError("not_found", "Member not found", 404);
    }
    return apiError("forbidden", "Insufficient permissions", 403);
  }

  return NextResponse.json({ ok: true });
}
