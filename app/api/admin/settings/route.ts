// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  getSystemSettings,
  updateSystemSettings,
  type UpdateSystemSettingsError,
} from "@/lib/admin/settings";
import { isSessionSystemAdmin } from "@/lib/admin/guard";
import { apiError } from "@/lib/api/errors";
import { getClientIp } from "@/lib/auth/credentials";
import { getSessionUserFromRequest } from "@/lib/session/request";

function mapSettingsError(error: UpdateSystemSettingsError) {
  switch (error) {
    case "invalid_pat_max_validity_days":
      return apiError(
        "bad_request",
        "Max validity days must be a positive integer",
        400,
      );
    case "pat_max_validity_days_required_when_never_expire_disabled":
      return apiError(
        "bad_request",
        "Max validity days is required when never-expiring tokens are disabled",
        400,
      );
  }
}

export async function GET(request: NextRequest) {
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return apiError("not_authenticated", "Not authenticated", 401);
  }

  if (!isSessionSystemAdmin(user)) {
    return apiError("forbidden", "System admin required", 403);
  }

  const settings = await getSystemSettings();
  return NextResponse.json({ settings });
}

type PatchBody = {
  patMaxValidityDays?: number | null;
  patAllowNeverExpire?: boolean;
};

export async function PATCH(request: NextRequest) {
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return apiError("not_authenticated", "Not authenticated", 401);
  }

  if (!isSessionSystemAdmin(user)) {
    return apiError("forbidden", "System admin required", 403);
  }

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return apiError("bad_request", "Invalid JSON body", 400);
  }

  const result = await updateSystemSettings(
    user.id,
    {
      patMaxValidityDays: body.patMaxValidityDays,
      patAllowNeverExpire: body.patAllowNeverExpire,
    },
    getClientIp(request),
  );

  if (!result.ok) {
    return mapSettingsError(result.error);
  }

  return NextResponse.json({ settings: result.settings });
}
