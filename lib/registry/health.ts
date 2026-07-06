// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

const DEFAULT_REGISTRY_URL = "http://registry:5000";
const REGISTRY_CHECK_TIMEOUT_MS = 5_000;

export function getRegistryInternalUrl(): string {
  return process.env.REGISTRY_INTERNAL_URL?.trim() || DEFAULT_REGISTRY_URL;
}

export async function isRegistryReachable(
  registryUrl = getRegistryInternalUrl(),
): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    REGISTRY_CHECK_TIMEOUT_MS,
  );

  try {
    const response = await fetch(`${registryUrl.replace(/\/$/, "")}/v2/`, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
    });

    return response.status === 401 || response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
