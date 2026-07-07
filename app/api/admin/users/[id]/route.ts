// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  deleteUser,
  getUserById,
  reactivateAdminUser,
  updateUser,
} from "@/lib/admin/users";
import { isSessionSystemAdmin } from "@/lib/admin/guard";
import { apiError } from "@/lib/api/errors";
import { sendSetPasswordEmailForUser } from "@/lib/auth/password-reset";
import type { SystemRole } from "@/lib/rbac/types";
import { getUserDeleteGracePeriodDays } from "@/lib/users/config";
import { getSessionUserFromRequest } from "@/lib/session/request";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type UpdateUserBody = {
  name?: string;
  email?: string;
  systemRole?: SystemRole;
  password?: string;
  sendResetEmail?: boolean;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return apiError("not_authenticated", "Not authenticated", 401);
  }

  if (!isSessionSystemAdmin(user)) {
    return apiError("forbidden", "System admin required", 403);
  }

  const { id } = await context.params;
  const target = await getUserById(id);
  if (!target) {
    return apiError("not_found", "User not found", 404);
  }

  return NextResponse.json({
    user: target,
    meta: { deleteGracePeriodDays: getUserDeleteGracePeriodDays() },
  });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return apiError("not_authenticated", "Not authenticated", 401);
  }

  if (!isSessionSystemAdmin(user)) {
    return apiError("forbidden", "System admin required", 403);
  }

  const { id } = await context.params;

  let body: UpdateUserBody;
  try {
    body = (await request.json()) as UpdateUserBody;
  } catch {
    return apiError("bad_request", "Invalid JSON body", 400);
  }

  if (body.systemRole && body.systemRole !== "admin" && body.systemRole !== "user") {
    return apiError("bad_request", "Invalid system role", 400);
  }

  const result = await updateUser(user.id, id, {
    name: body.name,
    email: body.email,
    systemRole: body.systemRole,
    password: body.password,
  });

  if ("error" in result) {
    if (result.error === "not_found") {
      return apiError("not_found", "User not found", 404);
    }
    if (result.error === "email_taken") {
      return apiError("conflict", "A user with this email already exists", 409);
    }
    if (result.error === "last_admin") {
      return apiError("forbidden", "Cannot demote the last system admin", 403);
    }
    return apiError("bad_request", "Invalid user input", 400);
  }

  let emailSent = false;
  if (body.sendResetEmail) {
    const emailResult = await sendSetPasswordEmailForUser(id);
    emailSent = emailResult.emailSent;
  }

  return NextResponse.json({
    user: result,
    meta: { deleteGracePeriodDays: getUserDeleteGracePeriodDays() },
    emailSent,
  });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return apiError("not_authenticated", "Not authenticated", 401);
  }

  if (!isSessionSystemAdmin(user)) {
    return apiError("forbidden", "System admin required", 403);
  }

  const { id } = await context.params;
  const result = await deleteUser(user.id, id);

  if ("error" in result) {
    if (result.error === "not_found") {
      return apiError("not_found", "User not found", 404);
    }
    if (result.error === "last_admin") {
      return apiError("forbidden", "Cannot delete the last system admin", 403);
    }
    return apiError("forbidden", "Insufficient permissions", 403);
  }

  return NextResponse.json({ ok: true });
}
