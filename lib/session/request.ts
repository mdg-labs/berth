// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import type { NextRequest } from "next/server";

import { getSessionIdFromCookie } from "./cookie";
import { getActiveSession, type SessionUser } from "./store";

export async function getSessionUserFromRequest(
  request: NextRequest,
): Promise<SessionUser | null> {
  const sessionId = getSessionIdFromCookie(request.headers.get("cookie"));
  if (!sessionId) {
    return null;
  }

  return getActiveSession(sessionId);
}

export async function getSessionIdFromRequest(
  request: NextRequest,
): Promise<string | null> {
  const sessionId = getSessionIdFromCookie(request.headers.get("cookie"));
  if (!sessionId) {
    return null;
  }

  const user = await getActiveSession(sessionId);
  return user ? sessionId : null;
}
