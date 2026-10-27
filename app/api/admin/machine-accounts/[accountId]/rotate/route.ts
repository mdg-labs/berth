// Copyright (c) 2026 Michael David Guggenbichler (MDG Labs), licensed under Apache-2.0 — see LICENSE

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { isSessionSystemAdmin } from "@/lib/admin/guard";
import { apiError } from "@/lib/api/errors";
import { getClientIp } from "@/lib/auth/credentials";
import { machineAccountExpiryResponse } from "@/lib/machine-accounts/responses";
import { rotateMachineAccount } from "@/lib/machine-accounts/store";
import { parseRotateMachineAccountBody } from "@/lib/machine-accounts/validation";
import { getSessionUserFromRequest } from "@/lib/session/request";

type RouteContext = {
  params: Promise<{ accountId: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return apiError("not_authenticated", "Not authenticated", 401);
  }

  if (!isSessionSystemAdmin(user)) {
    return apiError("forbidden", "System admin required", 403);
  }

  const { accountId } = await context.params;

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return apiError("bad_request", "Invalid JSON body", 400);
  }

  const parsed = parseRotateMachineAccountBody(rawBody);
  if (!parsed.ok) {
    return parsed.error === "invalid_json"
      ? apiError("bad_request", "Invalid JSON body", 400)
      : apiError(
          "bad_request",
          `Invalid machine account: ${parsed.error}`,
          400,
        );
  }

  const result = await rotateMachineAccount(
    { id: user.id },
    null,
    accountId,
    parsed.input,
    getClientIp(request),
  );
  if (!result.ok) {
    return result.error === "not_found"
      ? apiError("not_found", "Machine account not found", 404)
      : machineAccountExpiryResponse(result.error);
  }

  return NextResponse.json(
    { machineAccount: result.summary, secret: result.secret },
    { headers: { "Cache-Control": "no-store" } },
  );
}
