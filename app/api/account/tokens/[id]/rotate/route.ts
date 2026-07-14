// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiError } from "@/lib/api/errors";
import { getClientIp } from "@/lib/auth/credentials";
import { rotatePersonalAccessToken } from "@/lib/pat/store";
import type { RotatePersonalAccessTokenInput } from "@/lib/pat/types";
import type { PatValidationError } from "@/lib/pat/validation";
import { getSessionUserFromRequest } from "@/lib/session/request";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function mapPatError(error: PatValidationError | "not_found" | "token_expired") {
  switch (error) {
    case "not_found":
      return apiError("not_found", "Token not found", 404);
    case "token_expired":
      return apiError(
        "bad_request",
        "Token is expired; enable reset expiration to rotate",
        400,
      );
    case "never_expire_not_allowed":
      return apiError(
        "bad_request",
        "Never-expiring tokens are not allowed on this instance",
        400,
      );
    case "expiry_required":
      return apiError("bad_request", "Token expiry is required", 400);
    case "expiry_in_past":
      return apiError("bad_request", "Expiry must be in the future", 400);
    case "expiry_exceeds_max":
      return apiError(
        "bad_request",
        "Expiry exceeds the maximum allowed by this instance",
        400,
      );
    default:
      return apiError("bad_request", "Invalid token rotation request", 400);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return apiError("not_authenticated", "Not authenticated", 401);
  }

  let body: RotatePersonalAccessTokenInput = {};
  try {
    const parsed = (await request.json()) as RotatePersonalAccessTokenInput;
    body = parsed ?? {};
  } catch {
    return apiError("bad_request", "Invalid JSON body", 400);
  }

  const { id } = await context.params;
  const result = await rotatePersonalAccessToken(
    user.id,
    id,
    body,
    getClientIp(request),
  );

  if (!result.ok) {
    return mapPatError(result.error);
  }

  return NextResponse.json({
    token: result.token,
    summary: result.summary,
  });
}
