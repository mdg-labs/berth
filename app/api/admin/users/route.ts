// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { createLocalUser, listUsers } from "@/lib/admin/users";
import { isSessionSystemAdmin } from "@/lib/admin/guard";
import { apiError } from "@/lib/api/errors";
import type { SystemRole } from "@/lib/rbac/types";
import { getSessionUserFromRequest } from "@/lib/session/request";

type CreateUserBody = {
  email?: string;
  name?: string;
  password?: string;
  systemRole?: SystemRole;
};

export async function GET(request: NextRequest) {
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return apiError("not_authenticated", "Not authenticated", 401);
  }

  if (!isSessionSystemAdmin(user)) {
    return apiError("forbidden", "System admin required", 403);
  }

  const users = await listUsers();
  return NextResponse.json({ users });
}

export async function POST(request: NextRequest) {
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return apiError("not_authenticated", "Not authenticated", 401);
  }

  if (!isSessionSystemAdmin(user)) {
    return apiError("forbidden", "System admin required", 403);
  }

  let body: CreateUserBody;
  try {
    body = (await request.json()) as CreateUserBody;
  } catch {
    return apiError("bad_request", "Invalid JSON body", 400);
  }

  if (!body.email?.trim() || !body.name?.trim()) {
    return apiError("bad_request", "Email and name are required", 400);
  }

  if (body.systemRole && body.systemRole !== "admin" && body.systemRole !== "user") {
    return apiError("bad_request", "Invalid system role", 400);
  }

  const result = await createLocalUser(user.id, {
    email: body.email,
    name: body.name,
    password: body.password,
    systemRole: body.systemRole,
  });

  if ("error" in result) {
    if (result.error === "email_taken") {
      return apiError("conflict", "A user with this email already exists", 409);
    }
    return apiError("bad_request", "Invalid user input", 400);
  }

  return NextResponse.json({ user: result }, { status: 201 });
}
