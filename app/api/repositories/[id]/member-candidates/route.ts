// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiError } from "@/lib/api/errors";
import { searchMemberCandidates } from "@/lib/members/service";
import { getSessionUserFromRequest } from "@/lib/session/request";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return apiError("not_authenticated", "Not authenticated", 401);
  }

  const { id } = await context.params;
  const query = request.nextUrl.searchParams.get("q") ?? "";

  const result = await searchMemberCandidates(
    id,
    user.id,
    user.systemRole,
    query,
  );

  if ("error" in result) {
    if (result.error === "not_found") {
      return apiError("not_found", "Repository not found", 404);
    }
    return apiError("forbidden", "Insufficient permissions", 403);
  }

  return NextResponse.json({ users: result });
}
