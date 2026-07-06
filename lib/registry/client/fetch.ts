// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { getRegistryInternalUrl } from "@/lib/registry/health";

const REGISTRY_TIMEOUT_MS = 15_000;

export class RegistryUpstreamError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "RegistryUpstreamError";
    this.status = status;
  }
}

export async function registryFetch(
  path: string,
  token: string,
  init: RequestInit = {},
): Promise<Response> {
  const base = getRegistryInternalUrl().replace(/\/$/, "");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REGISTRY_TIMEOUT_MS);

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);

  try {
    const response = await fetch(`${base}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
      cache: "no-store",
    });

    return response;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new RegistryUpstreamError("Registry request timed out", 504);
    }

    throw new RegistryUpstreamError("Registry upstream unavailable", 502);
  } finally {
    clearTimeout(timeout);
  }
}

export async function registryJson<T>(
  path: string,
  token: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await registryFetch(path, token, init);

  if (!response.ok) {
    throw new RegistryUpstreamError(
      `Registry request failed: ${response.statusText}`,
      response.status,
    );
  }

  return (await response.json()) as T;
}
