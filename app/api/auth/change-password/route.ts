// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiError } from "@/lib/api/errors";
import {
  findUserByEmail,
  hashPassword,
  verifyPassword,
} from "@/lib/auth/credentials";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getSessionUserFromRequest } from "@/lib/session/request";

type ChangePasswordBody = {
  currentPassword?: string;
  newPassword?: string;
};

export async function POST(request: NextRequest) {
  const sessionUser = await getSessionUserFromRequest(request);
  if (!sessionUser) {
    return apiError("not_authenticated", "Not authenticated", 401);
  }

  let body: ChangePasswordBody;
  try {
    body = (await request.json()) as ChangePasswordBody;
  } catch {
    return apiError("bad_request", "Invalid JSON body", 400);
  }

  const currentPassword = body.currentPassword;
  const newPassword = body.newPassword;

  if (!newPassword || newPassword.length < 8) {
    return apiError(
      "bad_request",
      "New password must be at least 8 characters",
      400,
    );
  }

  const db = getDb();
  const user = await findUserByEmail(sessionUser.email);
  if (!user) {
    return apiError("not_authenticated", "Not authenticated", 401);
  }

  if (!sessionUser.mustChangePassword) {
    if (!currentPassword) {
      return apiError("bad_request", "Current password is required", 400);
    }

    if (!(await verifyPassword(user.passwordHash, currentPassword))) {
      return apiError("invalid_credentials", "Current password is incorrect", 401);
    }
  } else if (currentPassword) {
    if (!(await verifyPassword(user.passwordHash, currentPassword))) {
      return apiError("invalid_credentials", "Current password is incorrect", 401);
    }
  }

  const passwordHash = await hashPassword(newPassword);
  await db
    .update(users)
    .set({
      passwordHash,
      mustChangePassword: false,
    })
    .where(eq(users.id, user.id));

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      systemRole: user.systemRole,
      mustChangePassword: false,
    },
  });
}
