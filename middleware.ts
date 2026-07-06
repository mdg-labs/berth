// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { CSRF_HEADER, CSRF_VALUE } from "@/lib/csrf/constants";
import { hasValidCsrfHeader, requiresCsrfHeader } from "@/lib/csrf/check";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

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

export const config = {
  matcher: "/api/:path*",
};

export { CSRF_HEADER, CSRF_VALUE };
