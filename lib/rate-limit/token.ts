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

function consumeTokenBuckets(
  ip: string,
  identityKey: string,
  ipAlreadyCounted: boolean,
): boolean {
  const { maxAttempts, windowSeconds } = getTokenLimits();
  return (
    (ipAlreadyCounted ||
      consumeRateLimit(`token:ip:${ip}`, maxAttempts, windowSeconds)) &&
    consumeRateLimit(identityKey, maxAttempts, windowSeconds)
  );
}

// Runs before any Basic credential is checked. A null username (a Basic header
// that could not be decoded) consumes only the per-IP bucket.
export function checkBasicCredentialRateLimit(
  ip: string,
  username: string | null,
): boolean {
  const { maxAttempts, windowSeconds } = getTokenLimits();
  if (!consumeRateLimit(`token:ip:${ip}`, maxAttempts, windowSeconds)) {
    return false;
  }
  if (username === null) {
    return true;
  }
  return consumeRateLimit(
    `token:basic:${username.trim().toLowerCase()}`,
    maxAttempts,
    windowSeconds,
  );
}

// ipAlreadyCounted: checkBasicCredentialRateLimit already consumed this request's
// per-IP bucket, so only the identity bucket is consumed here.
export function checkTokenRateLimit(
  ip: string,
  identifier: string,
  ipAlreadyCounted = false,
): boolean {
  const normalizedIdentifier = identifier.trim().toLowerCase() || "anonymous";
  return consumeTokenBuckets(
    ip,
    `token:id:${normalizedIdentifier}`,
    ipAlreadyCounted,
  );
}

export function checkMachineTokenRateLimit(
  ip: string,
  machineAccountId: string,
  ipAlreadyCounted = false,
): boolean {
  return consumeTokenBuckets(
    ip,
    `token:machine:${machineAccountId}`,
    ipAlreadyCounted,
  );
}
