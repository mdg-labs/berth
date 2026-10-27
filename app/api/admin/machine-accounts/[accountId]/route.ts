// Copyright (c) 2026 Michael David Guggenbichler (MDG Labs), licensed under Apache-2.0 — see LICENSE

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { isSessionSystemAdmin } from "@/lib/admin/guard";
import { apiError } from "@/lib/api/errors";
import { getClientIp } from "@/lib/auth/credentials";
import {
  deleteMachineAccountAsAdmin,
  updateHostMachineAccount,
} from "@/lib/machine-accounts/store";
import { parseHostMachineAccountUpdate } from "@/lib/machine-accounts/validation";
import { getSessionUserFromRequest } from "@/lib/session/request";

type RouteContext = {
  params: Promise<{ accountId: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return apiError("not_authenticated", "Not authenticated", 401);
  }

  if (!isSessionSystemAdmin(user)) {
    return apiError("forbidden", "System admin required", 403);
  }

  const { accountId } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("bad_request", "Invalid JSON body", 400);
  }

  const parsed = parseHostMachineAccountUpdate(body);
  if (!parsed.ok) {
    return apiError(
      "bad_request",
      `Invalid machine account: ${parsed.error}`,
      400,
    );
  }

  const result = await updateHostMachineAccount(
    { id: user.id },
    accountId,
    parsed.input,
    getClientIp(request),
  );

  if (!result.ok) {
    switch (result.error) {
      case "not_found":
        return apiError("not_found", "Machine account not found", 404);
      case "not_host_account":
        return apiError(
          "bad_request",
          "Only host machine accounts can be edited",
          400,
        );
      default:
        return apiError(
          "bad_request",
          "Invalid machine account: invalid_repository_ids",
          400,
        );
    }
  }

  return NextResponse.json({ machineAccount: result.summary });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return apiError("not_authenticated", "Not authenticated", 401);
  }

  if (!isSessionSystemAdmin(user)) {
    return apiError("forbidden", "System admin required", 403);
  }

  const { accountId } = await context.params;
  const deleted = await deleteMachineAccountAsAdmin(
    { id: user.id },
    accountId,
    getClientIp(request),
  );
  if (!deleted) {
    return apiError("not_found", "Machine account not found", 404);
  }

  return NextResponse.json({ ok: true });
}
