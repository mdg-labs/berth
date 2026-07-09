// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { MFA_PENDING_COOKIE } from "./config";

export function getMfaPendingCookieValue(
  cookieHeader: string | null,
): string | null {
  if (!cookieHeader) {
    return null;
  }

  for (const part of cookieHeader.split(";")) {
    const [name, ...valueParts] = part.trim().split("=");
    if (name === MFA_PENDING_COOKIE) {
      const value = valueParts.join("=");
      return value ? decodeURIComponent(value) : null;
    }
  }

  return null;
}

/** Middleware-safe presence check; API routes must verify the signed payload. */
export function hasMfaPendingCookiePresent(cookieHeader: string | null): boolean {
  return Boolean(getMfaPendingCookieValue(cookieHeader));
}
