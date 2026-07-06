// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiError } from "@/lib/api/errors";
import { isSessionSystemAdmin } from "@/lib/admin/guard";
import { deleteUser, getUserById, updateUser } from "@/lib/admin/users";
import { getUserDeleteGracePeriodDays } from "@/lib/users/config";
import { getSessionUserFromRequest } from "@/lib/session/request";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type UpdateUserBody = {
  name?: string;
  email?: string;
  systemRole?: "admin" | "user";
  password?: string;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const actor = await getSessionUserFromRequest(request);
  if (!actor) {
    return apiError("not_authenticated", "Not authenticated", 401);
  }

  if (!isSessionSystemAdmin(actor)) {
    return apiError("forbidden", "Forbidden", 403);
  }

  const { id } = await context.params;
  const user = await getUserById(id);
  if (!user) {
    return apiError("not_found", "User not found", 404);
  }

  return NextResponse.json({
    user,
    meta: { deleteGracePeriodDays: getUserDeleteGracePeriodDays() },
  });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const actor = await getSessionUserFromRequest(request);
  if (!actor) {
    return apiError("not_authenticated", "Not authenticated", 401);
  }

  if (actor.systemRole !== "admin") {
    return apiError("forbidden", "Forbidden", 403);
  }

  const { id } = await context.params;

  let body: UpdateUserBody;
  try {
    body = (await request.json()) as UpdateUserBody;
  } catch {
    return apiError("bad_request", "Invalid JSON body", 400);
  }

  const result = await updateUser(actor.id, id, body);
  if ("error" in result) {
    if (result.error === "not_found") {
      return apiError("not_found", "User not found", 404);
    }
    if (result.error === "email_taken") {
      return apiError("conflict", "Email is already in use", 409);
    }
    if (result.error === "last_admin") {
      return apiError("forbidden", "Cannot demote or delete the last system admin", 403);
    }
    return apiError("bad_request", "Invalid user input", 400);
  }

  return NextResponse.json({ user: result });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const actor = await getSessionUserFromRequest(request);
  if (!actor) {
    return apiError("not_authenticated", "Not authenticated", 401);
  }

  if (actor.systemRole !== "admin") {
    return apiError("forbidden", "Forbidden", 403);
  }

  const { id } = await context.params;
  const result = await deleteUser(actor.id, id);
  if ("error" in result) {
    if (result.error === "not_found") {
      return apiError("not_found", "User not found", 404);
    }
    if (result.error === "last_admin") {
      return apiError("forbidden", "Cannot delete the last system admin", 403);
    }
    return apiError("forbidden", "Cannot delete your own account", 403);
  }

  return NextResponse.json({ ok: true });
}
