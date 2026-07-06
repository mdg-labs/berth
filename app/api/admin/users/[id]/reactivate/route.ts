// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiError } from "@/lib/api/errors";
import { reactivateAdminUser } from "@/lib/admin/users";
import { getSessionUserFromRequest } from "@/lib/session/request";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const actor = await getSessionUserFromRequest(request);
  if (!actor) {
    return apiError("not_authenticated", "Not authenticated", 401);
  }

  if (actor.systemRole !== "admin") {
    return apiError("forbidden", "Forbidden", 403);
  }

  const { id } = await context.params;
  const result = await reactivateAdminUser(actor.id, id);
  if ("error" in result) {
    if (result.error === "not_found") {
      return apiError("not_found", "User not found", 404);
    }
    return apiError("bad_request", "User is not pending deletion", 400);
  }

  return NextResponse.json({ ok: true });
}
