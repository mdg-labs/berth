// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

const DEFAULT_PROXY_TIMEOUT_MS = 600_000;

export function getRegistryProxyTimeoutMs(): number {
  const parsed = Number.parseInt(
    process.env.REGISTRY_PROXY_TIMEOUT_MS ?? "",
    10,
  );
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_PROXY_TIMEOUT_MS;
}
