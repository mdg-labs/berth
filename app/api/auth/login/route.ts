// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiError } from "@/lib/api/errors";
import { acceptPendingInvitesForEmail } from "@/lib/auth/invites";
import {
  findUserByEmail,
  getClientIp,
  verifyPassword,
} from "@/lib/auth/credentials";
import { checkLoginRateLimit } from "@/lib/rate-limit/login";
import { buildSessionCookie } from "@/lib/session/cookie";
import { createSession } from "@/lib/session/store";
import { getUserDeletionState } from "@/lib/users/presentation";
import { resolveUserForAuthentication } from "@/lib/users/lifecycle";
import { toAuthUser } from "@/lib/users/serialize";

type LoginBody = {
  email?: string;
  password?: string;
};

export async function POST(request: NextRequest) {
  let body: LoginBody;

  try {
    body = (await request.json()) as LoginBody;
  } catch {
    return apiError("bad_request", "Invalid JSON body", 400);
  }

  const email = body.email?.trim();
  const password = body.password;

  if (!email || !password) {
    return apiError("bad_request", "Email and password are required", 400);
  }

  const clientIp = getClientIp(request);
  if (!checkLoginRateLimit(clientIp, email)) {
    return apiError("rate_limited", "Too many login attempts", 429);
  }

  const user = await findUserByEmail(email);
  if (!user || !(await verifyPassword(user.passwordHash, password))) {
    return apiError("invalid_credentials", "Invalid email or password", 401);
  }

  const authState = await resolveUserForAuthentication(user);
  if (authState === "purged") {
    return apiError("invalid_credentials", "Invalid email or password", 401);
  }

  await acceptPendingInvitesForEmail(user.id, user.email, {
    requireEmailVerified: false,
  });

  const sessionId = await createSession(user.id);
  const deletion = getUserDeletionState(user.deletedAt);

  return NextResponse.json(
    {
      user: toAuthUser({
        id: user.id,
        email: user.email,
        name: user.name,
        systemRole: user.systemRole,
        mustChangePassword: user.mustChangePassword,
        hasPassword: user.passwordHash !== null,
        pendingDeletion: deletion.pendingDeletion,
        deletedAt: deletion.deletedAt,
        purgesAt: deletion.purgesAt,
      }),
    },
    {
      status: 200,
      headers: {
        "Set-Cookie": buildSessionCookie(sessionId),
      },
    },
  );
}
