// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import type { NextRequest } from "next/server";

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function getPublicOrigin(request: NextRequest): string {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host")?.trim();
  const forwardedProto = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim();

  if (host) {
    const protocol = forwardedProto ?? request.nextUrl.protocol.replace(":", "");
    return `${protocol}://${host}`;
  }

  const appUrl = process.env.APP_URL?.trim();
  if (appUrl) {
    return trimTrailingSlash(appUrl);
  }

  return trimTrailingSlash(request.nextUrl.origin);
}
