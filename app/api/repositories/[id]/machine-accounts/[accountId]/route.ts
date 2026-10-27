// Copyright (c) 2026 Michael David Guggenbichler (MDG Labs), licensed under Apache-2.0 — see LICENSE

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiError } from "@/lib/api/errors";
import { getClientIp } from "@/lib/auth/credentials";
import { requireMachineAccountAdmin } from "@/lib/machine-accounts/access";
import { deleteMachineAccount } from "@/lib/machine-accounts/store";
import { getSessionUserFromRequest } from "@/lib/session/request";

type RouteContext = {
  params: Promise<{ id: string; accountId: string }>;
};

export async function DELETE(request: NextRequest, context: RouteContext) {
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return apiError("not_authenticated", "Not authenticated", 401);
  }

  const { id, accountId } = await context.params;
  const access = await requireMachineAccountAdmin(id, user);
  if (!access.ok) {
    return access.error === "not_found"
      ? apiError("not_found", "Repository not found", 404)
      : apiError("forbidden", "Insufficient permissions", 403);
  }

  const deleted = await deleteMachineAccount(
    { id: user.id },
    access.repository.id,
    accountId,
    getClientIp(request),
  );
  if (!deleted) {
    return apiError("not_found", "Machine account not found", 404);
  }

  return NextResponse.json({ ok: true });
}
