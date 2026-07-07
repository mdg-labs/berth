// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiError } from "@/lib/api/errors";
import { getClientIp } from "@/lib/auth/credentials";
import {
  completePasswordReset,
  requestPasswordReset,
  validatePasswordResetToken,
} from "@/lib/auth/password-reset";
import { checkForgotPasswordRateLimit } from "@/lib/rate-limit/login";

type ForgotPasswordBody = {
  email?: string;
};

export async function POST(request: NextRequest) {
  let body: ForgotPasswordBody;
  try {
    body = (await request.json()) as ForgotPasswordBody;
  } catch {
    return apiError("bad_request", "Invalid JSON body", 400);
  }

  const email = body.email?.trim().toLowerCase() ?? "";
  if (!email) {
    return apiError("bad_request", "Email is required", 400);
  }

  const ip = getClientIp(request);
  if (!checkForgotPasswordRateLimit(ip, email)) {
    return apiError("rate_limited", "Too many requests", 429);
  }

  await requestPasswordReset(email);

  return NextResponse.json({
    message:
      "If an account exists for that email, a password reset link has been sent.",
  });
}
