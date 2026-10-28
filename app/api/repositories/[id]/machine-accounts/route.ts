// Copyright (c) 2026 Michael David Guggenbichler (MDG Labs), licensed under Apache-2.0 — see LICENSE

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiError } from "@/lib/api/errors";
import { getClientIp } from "@/lib/auth/credentials";
import { requireMachineAccountAdmin } from "@/lib/machine-accounts/access";
import { machineAccountExpiryResponse } from "@/lib/machine-accounts/responses";
import {
  createMachineAccount,
  listMachineAccounts,
} from "@/lib/machine-accounts/store";
import { parseMachineAccountInput } from "@/lib/machine-accounts/validation";
import { getPatPolicy } from "@/lib/pat/config";
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
  const access = await requireMachineAccountAdmin(id, user);
  if (!access.ok) {
    return access.error === "not_found"
      ? apiError("not_found", "Repository not found", 404)
      : apiError("forbidden", "Insufficient permissions", 403);
  }

  const [machineAccounts, policy] = await Promise.all([
    listMachineAccounts(access.repository.id),
    getPatPolicy(),
  ]);
  return NextResponse.json({ machineAccounts, policy });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return apiError("not_authenticated", "Not authenticated", 401);
  }

  const { id } = await context.params;
  const access = await requireMachineAccountAdmin(id, user);
  if (!access.ok) {
    return access.error === "not_found"
      ? apiError("not_found", "Repository not found", 404)
      : apiError("forbidden", "Insufficient permissions", 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("bad_request", "Invalid JSON body", 400);
  }

  const parsed = parseMachineAccountInput(body);
  if (!parsed.ok) {
    return apiError("bad_request", `Invalid machine account: ${parsed.error}`, 400);
  }

  const result = await createMachineAccount(
    { id: user.id, name: user.name },
    access.repository,
    parsed.input,
    getClientIp(request),
  );

  if (!result.ok) {
    if (result.error === "duplicate_name") {
      return apiError(
        "conflict",
        "A machine account with this name already exists",
        409,
      );
    }
    if (result.error === "repository_not_found") {
      return apiError("not_found", "Repository not found", 404);
    }
    return machineAccountExpiryResponse(result.error);
  }

  return NextResponse.json(
    { machineAccount: result.summary, secret: result.secret },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}
