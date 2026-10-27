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

function consumeTokenBuckets(ip: string, identityKey: string): boolean {
  const { maxAttempts, windowSeconds } = getTokenLimits();
  return (
    consumeRateLimit(`token:ip:${ip}`, maxAttempts, windowSeconds) &&
    consumeRateLimit(identityKey, maxAttempts, windowSeconds)
  );
}

export function checkTokenRateLimit(
  ip: string,
  identifier: string,
): boolean {
  const normalizedIdentifier = identifier.trim().toLowerCase() || "anonymous";
  return consumeTokenBuckets(ip, `token:id:${normalizedIdentifier}`);
}

export function checkMachineTokenRateLimit(
  ip: string,
  machineAccountId: string,
): boolean {
  return consumeTokenBuckets(ip, `token:machine:${machineAccountId}`);
}
