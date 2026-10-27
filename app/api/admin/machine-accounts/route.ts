// Copyright (c) 2026 Michael David Guggenbichler (MDG Labs), licensed under Apache-2.0 — see LICENSE

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { isSessionSystemAdmin } from "@/lib/admin/guard";
import { apiError } from "@/lib/api/errors";
import { getClientIp } from "@/lib/auth/credentials";
import {
  createHostMachineAccount,
  listAllMachineAccounts,
} from "@/lib/machine-accounts/store";
import { machineAccountExpiryResponse } from "@/lib/machine-accounts/responses";
import { parseHostMachineAccountInput } from "@/lib/machine-accounts/validation";
import { getSessionUserFromRequest } from "@/lib/session/request";

export async function GET(request: NextRequest) {
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return apiError("not_authenticated", "Not authenticated", 401);
  }

  if (!isSessionSystemAdmin(user)) {
    return apiError("forbidden", "System admin required", 403);
  }

  const machineAccounts = await listAllMachineAccounts();
  return NextResponse.json({ machineAccounts });
}

export async function POST(request: NextRequest) {
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return apiError("not_authenticated", "Not authenticated", 401);
  }

  if (!isSessionSystemAdmin(user)) {
    return apiError("forbidden", "System admin required", 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("bad_request", "Invalid JSON body", 400);
  }

  const parsed = parseHostMachineAccountInput(body);
  if (!parsed.ok) {
    return apiError(
      "bad_request",
      `Invalid machine account: ${parsed.error}`,
      400,
    );
  }

  const result = await createHostMachineAccount(
    { id: user.id, name: user.name },
    parsed.input,
    getClientIp(request),
  );

  if (!result.ok) {
    if (result.error === "duplicate_name") {
      return apiError(
        "conflict",
        "A host machine account with this name already exists",
        409,
      );
    }
    if (result.error === "repository_not_found") {
      return apiError(
        "bad_request",
        "Invalid machine account: invalid_repository_ids",
        400,
      );
    }
    return machineAccountExpiryResponse(result.error);
  }

  return NextResponse.json(
    { machineAccount: result.summary, secret: result.secret },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}
