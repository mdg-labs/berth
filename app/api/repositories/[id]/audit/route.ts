// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { listAuditLog, parseAuditLogQuery } from "@/lib/audit/query";
import { apiError } from "@/lib/api/errors";
import { getDb } from "@/lib/db";
import { repositories } from "@/lib/db/schema";
import { canPerformRepositoryAction } from "@/lib/rbac/check";
import { getRepositoryMemberRole } from "@/lib/rbac/roles";
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

  const db = getDb();
  const [repository] = await db
    .select({ id: repositories.id })
    .from(repositories)
    .where(eq(repositories.id, id))
    .limit(1);

  if (!repository) {
    return apiError("not_found", "Repository not found", 404);
  }

  const memberRole = await getRepositoryMemberRole(user.id, id);
  if (!canPerformRepositoryAction(user.systemRole, memberRole, "update_repository")) {
    return apiError("forbidden", "Insufficient permissions", 403);
  }

  const query = {
    ...parseAuditLogQuery(request.nextUrl.searchParams),
    repositoryId: id,
  };
  const result = await listAuditLog(query);

  return NextResponse.json(result);
}
