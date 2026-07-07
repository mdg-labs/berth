// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiError } from "@/lib/api/errors";
import { acceptUserInvite, validateUserInvite } from "@/lib/admin/invites";

type AcceptInviteBody = {
  token?: string;
  password?: string;
};

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  if (!token) {
    return apiError("bad_request", "Token is required", 400);
  }

  const validation = await validateUserInvite(token);
  if (!validation.valid) {
    return apiError("bad_request", "Invalid or expired invite link", 400);
  }

  return NextResponse.json({
    email: validation.email,
    name: validation.name,
    systemRole: validation.systemRole,
  });
}

export async function POST(request: NextRequest) {
  let body: AcceptInviteBody;
  try {
    body = (await request.json()) as AcceptInviteBody;
  } catch {
    return apiError("bad_request", "Invalid JSON body", 400);
  }

  const token = body.token?.trim() ?? "";
  const password = body.password ?? "";
  if (!token || !password) {
    return apiError("bad_request", "Token and password are required", 400);
  }

  const result = await acceptUserInvite(token, password);
  if ("error" in result) {
    if (result.error === "invalid_input") {
      return apiError("bad_request", "Password must be at least 8 characters", 400);
    }
    if (result.error === "email_taken") {
      return apiError("conflict", "An account with this email already exists", 409);
    }
    return apiError("bad_request", "Invalid or expired invite link", 400);
  }

  return NextResponse.json({ ok: true, userId: result.userId });
}
