// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

const DEFAULT_TOKEN_TTL_SECONDS = 300;
const DEFAULT_TOKEN_SERVICE = "registry";
const DEFAULT_TOKEN_ISSUER = "registry";

export function getTokenIssuer(): string {
  return process.env.TOKEN_ISSUER?.trim() || DEFAULT_TOKEN_ISSUER;
}

export function getTokenService(): string {
  return process.env.REGISTRY_AUTH_TOKEN_SERVICE?.trim() || DEFAULT_TOKEN_SERVICE;
}

export function getTokenTtlSeconds(): number {
  const parsed = Number.parseInt(process.env.TOKEN_TTL_SECONDS ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_TOKEN_TTL_SECONDS;
}
