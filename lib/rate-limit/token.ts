// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { consumeRateLimit } from "./login";

export function checkTokenRateLimit(
  ip: string,
  identifier: string,
): boolean {
  const normalizedIdentifier = identifier.trim().toLowerCase() || "anonymous";
  return (
    consumeRateLimit(`token:ip:${ip}`) &&
    consumeRateLimit(`token:id:${normalizedIdentifier}`)
  );
}
