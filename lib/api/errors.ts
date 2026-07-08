// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { NextResponse } from "next/server";

export const API_ERROR_CODES = [
  "bad_request",
  "conflict",
  "csrf_missing",
  "forbidden",
  "invalid_credentials",
  "not_authenticated",
  "not_found",
  "oidc_not_configured",
  "oidc_state_invalid",
  "rate_limited",
  "repository_not_found",
  "request_failed",
  "server_error",
  "user_not_found",
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export function isApiErrorCode(code: string): code is ApiErrorCode {
  return (API_ERROR_CODES as readonly string[]).includes(code);
}

export function apiError(
  code: ApiErrorCode,
  message: string,
  status: number,
): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}
