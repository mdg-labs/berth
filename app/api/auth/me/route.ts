// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiError } from "@/lib/api/errors";
import { getSessionUserFromRequest } from "@/lib/session/request";
import { toAuthUser } from "@/lib/users/serialize";

export async function GET(request: NextRequest) {
  const user = await getSessionUserFromRequest(request);

  if (!user) {
    return apiError("not_authenticated", "Not authenticated", 401);
  }

  return NextResponse.json({ user: toAuthUser(user) });
}
