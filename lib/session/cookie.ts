// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import type { ResponseCookie } from "next/dist/compiled/@edge-runtime/cookies";

import {
  SESSION_COOKIE_NAME,
  cookieSecure,
  getSessionTtlSeconds,
} from "./config";

export function getSessionIdFromCookie(
  cookieHeader: string | null,
): string | null {
  if (!cookieHeader) {
    return null;
  }

  for (const part of cookieHeader.split(";")) {
    const [name, ...valueParts] = part.trim().split("=");
    if (name === SESSION_COOKIE_NAME) {
      const value = valueParts.join("=");
      return value ? decodeURIComponent(value) : null;
    }
  }

  return null;
}

function sessionCookieOptions(maxAge: number): Partial<ResponseCookie> {
  return {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "lax",
    path: "/",
    maxAge,
  };
}

export function buildSessionCookie(sessionId: string): string {
  const maxAge = getSessionTtlSeconds();
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(sessionId)}`,
    "HttpOnly",
    `Path=/`,
    `Max-Age=${maxAge}`,
    `SameSite=Lax`,
  ];

  if (cookieSecure()) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

export function buildClearSessionCookie(): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    "HttpOnly",
    "Path=/",
    "Max-Age=0",
    "SameSite=Lax",
  ];

  if (cookieSecure()) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

export { sessionCookieOptions, SESSION_COOKIE_NAME };
