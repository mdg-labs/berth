// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

export const SESSION_COOKIE_NAME = "berth_session";

export function getSessionTtlSeconds(): number {
  const configured = Number.parseInt(
    process.env.SESSION_TTL_SECONDS ?? "604800",
    10,
  );
  return Number.isFinite(configured) ? configured : 604800;
}

export function cookieSecure(): boolean {
  const appUrl = process.env.APP_URL ?? "http://localhost:8080";
  return appUrl.startsWith("https://");
}
