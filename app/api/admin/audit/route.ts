// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { listAuditLog, parseAuditLogQuery } from "@/lib/audit/query";
import { isSessionSystemAdmin } from "@/lib/admin/guard";
import { apiError } from "@/lib/api/errors";
import { getSessionUserFromRequest } from "@/lib/session/request";

export async function GET(request: NextRequest) {
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return apiError("not_authenticated", "Not authenticated", 401);
  }

  if (!isSessionSystemAdmin(user)) {
    return apiError("forbidden", "System admin required", 403);
  }

  const query = parseAuditLogQuery(request.nextUrl.searchParams);
  const result = await listAuditLog(query);

  return NextResponse.json(result);
}
