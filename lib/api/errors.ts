// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { NextResponse } from "next/server";

export type ApiErrorCode =
  | "bad_request"
  | "conflict"
  | "csrf_missing"
  | "forbidden"
  | "invalid_credentials"
  | "not_authenticated"
  | "not_found"
  | "oidc_not_configured"
  | "oidc_state_invalid"
  | "repository_not_found"
  | "rate_limited"
  | "server_error";

export function apiError(
  code: ApiErrorCode,
  message: string,
  status: number,
): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}
