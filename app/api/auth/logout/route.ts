// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { writeAuditLog } from "@/lib/audit/log";
import { getClientIp } from "@/lib/auth/credentials";
import { buildClearSessionCookie } from "@/lib/session/cookie";
import { getSessionIdFromRequest, getSessionUserFromRequest } from "@/lib/session/request";
import { revokeSession } from "@/lib/session/store";

export async function POST(request: NextRequest) {
  const sessionUser = await getSessionUserFromRequest(request);
  const sessionId = await getSessionIdFromRequest(request);

  if (sessionId) {
    await revokeSession(sessionId);
  }

  if (sessionUser) {
    await writeAuditLog({
      userId: sessionUser.id,
      action: "auth.logout",
      resource: `user:${sessionUser.email}`,
      clientIp: getClientIp(request),
    });
  }

  return NextResponse.json(
    { ok: true },
    {
      status: 200,
      headers: {
        "Set-Cookie": buildClearSessionCookie(),
      },
    },
  );
}
