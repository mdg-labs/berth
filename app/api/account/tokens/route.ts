// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getPatPolicy } from "@/lib/pat/config";
import {
  createPersonalAccessToken,
  listPersonalAccessTokens,
} from "@/lib/pat/store";
import type { CreatePersonalAccessTokenInput } from "@/lib/pat/types";
import type { PatValidationError } from "@/lib/pat/validation";
import { apiError } from "@/lib/api/errors";
import { getClientIp } from "@/lib/auth/credentials";
import { listRepositoriesForUser } from "@/lib/repositories/service";
import { getSessionUserFromRequest } from "@/lib/session/request";

function mapPatError(error: PatValidationError) {
  switch (error) {
    case "name_required":
      return apiError("bad_request", "Token name is required", 400);
    case "scope_required":
      return apiError(
        "bad_request",
        "At least one of pull or push must be enabled",
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
    case "invalid_repository":
      return apiError(
        "bad_request",
        "One or more repositories are invalid",
        400,
      );
    case "insufficient_repository_access":
      return apiError(
        "forbidden",
        "Insufficient access for one or more selected repositories",
        403,
      );
  }
}

export async function GET(request: NextRequest) {
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return apiError("not_authenticated", "Not authenticated", 401);
  }

  const [tokens, repositories, policy] = await Promise.all([
    listPersonalAccessTokens(user.id),
    listRepositoriesForUser({
      id: user.id,
      email: user.email,
      systemRole: user.systemRole,
    }),
    getPatPolicy(),
  ]);

  return NextResponse.json({
    tokens,
    repositories: repositories.map((repo) => ({
      id: repo.id,
      name: repo.name,
      role: repo.role,
    })),
    policy,
  });
}

export async function POST(request: NextRequest) {
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return apiError("not_authenticated", "Not authenticated", 401);
  }

  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return apiError("bad_request", "Invalid JSON body", 400);
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return apiError("bad_request", "Request body must be a JSON object", 400);
  }

  const { name, allowPull, allowPush, expiresAt, repositoryIds } = parsed as {
    name?: unknown;
    allowPull?: unknown;
    allowPush?: unknown;
    expiresAt?: unknown;
    repositoryIds?: unknown;
  };

  if (typeof name !== "string") {
    return apiError("bad_request", "name must be a string", 400);
  }
  if (typeof allowPull !== "boolean") {
    return apiError("bad_request", "allowPull must be a boolean", 400);
  }
  if (typeof allowPush !== "boolean") {
    return apiError("bad_request", "allowPush must be a boolean", 400);
  }
  if (
    expiresAt !== undefined &&
    expiresAt !== null &&
    typeof expiresAt !== "string"
  ) {
    return apiError("bad_request", "expiresAt must be a string or null", 400);
  }
  if (
    repositoryIds !== undefined &&
    repositoryIds !== null &&
    (!Array.isArray(repositoryIds) ||
      repositoryIds.some((id) => typeof id !== "string"))
  ) {
    return apiError(
      "bad_request",
      "repositoryIds must be an array of strings or null",
      400,
    );
  }

  const body: CreatePersonalAccessTokenInput = {
    name,
    allowPull,
    allowPush,
    expiresAt: expiresAt ?? null,
    repositoryIds: repositoryIds ?? null,
  };

  const result = await createPersonalAccessToken(
    {
      id: user.id,
      email: user.email,
      systemRole: user.systemRole,
    },
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
