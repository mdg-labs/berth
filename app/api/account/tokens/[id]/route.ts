// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiError } from "@/lib/api/errors";
import { getClientIp } from "@/lib/auth/credentials";
import { revokePersonalAccessToken } from "@/lib/pat/store";
import { getSessionUserFromRequest } from "@/lib/session/request";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(request: NextRequest, context: RouteContext) {
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return apiError("not_authenticated", "Not authenticated", 401);
  }

  const { id } = await context.params;
  const revoked = await revokePersonalAccessToken(
    user.id,
    id,
    getClientIp(request),
  );

  if (!revoked) {
    return apiError("not_found", "Token not found", 404);
  }

  return NextResponse.json({ ok: true });
}
