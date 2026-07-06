// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { consumeRateLimit, getRateLimitConfig } from "./login";

function getTokenLimits() {
  const shared = getRateLimitConfig();
  const tokenMaxAttempts = Number.parseInt(
    process.env.RATE_LIMIT_TOKEN_MAX_ATTEMPTS ?? "",
    10,
  );

  return {
    maxAttempts: Number.isFinite(tokenMaxAttempts)
      ? tokenMaxAttempts
      : shared.maxAttempts,
    windowSeconds: shared.windowSeconds,
  };
}

export function checkTokenRateLimit(
  ip: string,
  identifier: string,
): boolean {
  const { maxAttempts, windowSeconds } = getTokenLimits();
  const normalizedIdentifier = identifier.trim().toLowerCase() || "anonymous";
  return (
    consumeRateLimit(`token:ip:${ip}`, maxAttempts, windowSeconds) &&
    consumeRateLimit(
      `token:id:${normalizedIdentifier}`,
      maxAttempts,
      windowSeconds,
    )
  );
}
