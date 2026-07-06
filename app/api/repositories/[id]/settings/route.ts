// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiError } from "@/lib/api/errors";
import {
  getRepositorySettings,
  updateRepositorySettings,
} from "@/lib/repositories/settings";
import { getSessionUserFromRequest } from "@/lib/session/request";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type UpdateRepositorySettingsBody = {
  anonymousPullDefault?: boolean;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return apiError("not_authenticated", "Not authenticated", 401);
  }

  const { id } = await context.params;
  const result = await getRepositorySettings(id, user.id, user.systemRole);
  if ("error" in result) {
    if (result.error === "not_found") {
      return apiError("not_found", "Repository not found", 404);
    }
    return apiError("forbidden", "Insufficient permissions", 403);
  }

  return NextResponse.json({ settings: result });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return apiError("not_authenticated", "Not authenticated", 401);
  }

  const { id } = await context.params;

  let body: UpdateRepositorySettingsBody;
  try {
    body = (await request.json()) as UpdateRepositorySettingsBody;
  } catch {
    return apiError("bad_request", "Invalid JSON body", 400);
  }

  const result = await updateRepositorySettings(id, user.id, user.systemRole, body);
  if ("error" in result) {
    if (result.error === "not_found") {
      return apiError("not_found", "Repository not found", 404);
    }
    return apiError("forbidden", "Insufficient permissions", 403);
  }

  return NextResponse.json({ settings: result });
}
