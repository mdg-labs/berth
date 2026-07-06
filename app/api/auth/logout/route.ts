// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { buildClearSessionCookie } from "@/lib/session/cookie";
import { getSessionIdFromRequest } from "@/lib/session/request";
import { revokeSession } from "@/lib/session/store";

export async function POST(request: NextRequest) {
  const sessionId = await getSessionIdFromRequest(request);

  if (sessionId) {
    await revokeSession(sessionId);
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
