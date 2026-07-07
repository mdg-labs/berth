// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { ApiError } from "@/lib/api/client";
import { isApiErrorCode } from "@/lib/api/errors";

type ApiErrorTranslator = (key: string) => string;

export function formatApiError(
  t: ApiErrorTranslator,
  error: unknown,
  fallbackKey: string,
): string {
  if (error instanceof ApiError && isApiErrorCode(error.code)) {
    return t(error.code);
  }

  return t(fallbackKey);
}
