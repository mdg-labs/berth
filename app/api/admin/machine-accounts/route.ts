// Copyright (c) 2026 Michael David Guggenbichler (MDG Labs), licensed under Apache-2.0 — see LICENSE

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { isSessionSystemAdmin } from "@/lib/admin/guard";
import { apiError } from "@/lib/api/errors";
import { getClientIp } from "@/lib/auth/credentials";
import {
  createHostMachineAccount,
  listAllMachineAccounts,
  type MachineAccountFilters,
} from "@/lib/machine-accounts/store";
import { machineAccountExpiryResponse } from "@/lib/machine-accounts/responses";
import {
  isUuid,
  parseHostMachineAccountInput,
} from "@/lib/machine-accounts/validation";
import { getSessionUserFromRequest } from "@/lib/session/request";

const KINDS = ["repository", "host"] as const satisfies readonly NonNullable<
  MachineAccountFilters["kind"]
>[];
const STATUSES = ["active", "disabled", "expired"] as const satisfies readonly NonNullable<
  MachineAccountFilters["status"]
>[];

function parseFilters(
  params: URLSearchParams,
): { ok: true; filters: MachineAccountFilters } | { ok: false; error: string } {
  const filters: MachineAccountFilters = {};

  const kind = params.get("kind");
  if (kind !== null) {
    const match = KINDS.find((value) => value === kind);
    if (!match) {
      return { ok: false, error: "invalid_kind" };
    }
    filters.kind = match;
  }

  const status = params.get("status");
  if (status !== null) {
    const match = STATUSES.find((value) => value === status);
    if (!match) {
      return { ok: false, error: "invalid_status" };
    }
    filters.status = match;
  }

  const repositoryId = params.get("repositoryId");
  if (repositoryId !== null) {
    if (!isUuid(repositoryId)) {
      return { ok: false, error: "invalid_repository_id" };
    }
    filters.repositoryId = repositoryId.toLowerCase();
  }

  return { ok: true, filters };
}

export async function GET(request: NextRequest) {
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return apiError("not_authenticated", "Not authenticated", 401);
  }

  if (!isSessionSystemAdmin(user)) {
    return apiError("forbidden", "System admin required", 403);
  }

  const parsed = parseFilters(request.nextUrl.searchParams);
  if (!parsed.ok) {
    return apiError("bad_request", `Invalid filter: ${parsed.error}`, 400);
  }

  const machineAccounts = await listAllMachineAccounts(parsed.filters);
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
