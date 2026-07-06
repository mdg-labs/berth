// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { CSRF_HEADER, CSRF_VALUE, MUTATING_METHODS } from "./constants";

export function isCsrfExemptPath(pathname: string): boolean {
  return (
    pathname.startsWith("/api/auth/token") || pathname.startsWith("/v2/")
  );
}

export function requiresCsrfHeader(method: string, pathname: string): boolean {
  if (!pathname.startsWith("/api/")) {
    return false;
  }

  if (isCsrfExemptPath(pathname)) {
    return false;
  }

  return MUTATING_METHODS.has(method.toUpperCase());
}

export function hasValidCsrfHeader(headers: Headers): boolean {
  return headers.get(CSRF_HEADER) === CSRF_VALUE;
}
