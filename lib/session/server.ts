// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { cookies } from "next/headers";

import { SESSION_COOKIE_NAME } from "./config";
import { getActiveSession, type SessionUser } from "./store";

export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionId) {
    return null;
  }

  return getActiveSession(sessionId);
}
