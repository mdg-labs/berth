// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { CSRF_HEADER, CSRF_VALUE } from "@/lib/csrf/constants";
import { hasValidCsrfHeader, requiresCsrfHeader } from "@/lib/csrf/check";
import { getSessionIdFromCookie } from "@/lib/session/cookie";

const PUBLIC_PATHS = new Set(["/login"]);
const AUTH_ONLY_PATHS = new Set(["/change-password"]);
const PROTECTED_PREFIXES = ["/repositories", "/r", "/admin"];

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function hasSession(request: NextRequest): boolean {
  return Boolean(getSessionIdFromCookie(request.headers.get("cookie")));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/")) {
    if (
      requiresCsrfHeader(request.method, pathname) &&
      !hasValidCsrfHeader(request.headers)
    ) {
      return NextResponse.json(
        {
          error: {
            code: "csrf_missing",
            message: "Missing or invalid CSRF header",
          },
        },
        { status: 403 },
      );
    }

    return NextResponse.next();
  }

  if (pathname.startsWith("/v2")) {
    return NextResponse.next();
  }

  const sessionPresent = hasSession(request);

  if (pathname === "/" && sessionPresent) {
    return NextResponse.redirect(new URL("/repositories", request.url));
  }

  if (PUBLIC_PATHS.has(pathname) && sessionPresent) {
    return NextResponse.redirect(new URL("/repositories", request.url));
  }

  if (AUTH_ONLY_PATHS.has(pathname) && !sessionPresent) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (isProtectedPath(pathname) && !sessionPresent) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*", "/((?!_next/static|_next/image|favicon.ico).*)"],
};

export { CSRF_HEADER, CSRF_VALUE };
