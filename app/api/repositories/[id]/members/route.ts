// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiError } from "@/lib/api/errors";
import { addProjectMember, listProjectMembers } from "@/lib/members/service";
import type { RepositoryRole } from "@/lib/rbac/types";
import { getSessionUserFromRequest } from "@/lib/session/request";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type AddMemberBody = {
  email?: string;
  userId?: string;
  role?: RepositoryRole;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return apiError("not_authenticated", "Not authenticated", 401);
  }

  const { id } = await context.params;
  const result = await listProjectMembers(id, user.id, user.systemRole);

  if ("error" in result) {
    if (result.error === "not_found") {
      return apiError("not_found", "Repository not found", 404);
    }
    return apiError("forbidden", "Insufficient permissions", 403);
  }

  return NextResponse.json({ members: result });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return apiError("not_authenticated", "Not authenticated", 401);
  }

  const { id } = await context.params;

  let body: AddMemberBody;
  try {
    body = (await request.json()) as AddMemberBody;
  } catch {
    return apiError("bad_request", "Invalid JSON body", 400);
  }

  if ((!body.email?.trim() && !body.userId) || !body.role) {
    return apiError("bad_request", "User and role are required", 400);
  }

  const result = await addProjectMember(id, user.id, user.systemRole, {
    email: body.email,
    userId: body.userId,
    role: body.role,
  });

  if ("error" in result) {
    if (result.error === "not_found") {
      return apiError("not_found", "Repository not found", 404);
    }
    if (result.error === "forbidden") {
      return apiError("forbidden", "Insufficient permissions", 403);
    }
    if (result.error === "invalid_role") {
      return apiError("bad_request", "Invalid member role", 400);
    }
    if (result.error === "user_not_found") {
      return apiError(
        "user_not_found",
        "No user found with this email. Create the user in Admin first.",
        404,
      );
    }
    return apiError("conflict", "Member already exists", 409);
  }

  return NextResponse.json({ member: result }, { status: 201 });
}
