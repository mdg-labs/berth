// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { getRegistryInternalUrl } from "@/lib/registry/health";

function internalRegistryOrigins(): string[] {
  const configured = getRegistryInternalUrl().trim().replace(/\/$/, "");
  const origins = new Set<string>();

  try {
    const parsed = new URL(configured);
    origins.add(`${parsed.protocol}//${parsed.host}`);
    origins.add(`http://registry:5000`);
    origins.add(`http://registry:5000/`);
  } catch {
    origins.add("http://registry:5000");
  }

  return [...origins].map((origin) => origin.replace(/\/$/, ""));
}

export function rewriteRegistryLocation(
  location: string,
  publicOrigin: string,
): string {
  const normalizedPublic = publicOrigin.replace(/\/$/, "");

  for (const internalOrigin of internalRegistryOrigins()) {
    if (location.startsWith(`${internalOrigin}/`)) {
      return `${normalizedPublic}${location.slice(internalOrigin.length)}`;
    }
    if (location === internalOrigin) {
      return normalizedPublic;
    }
  }

  try {
    const parsed = new URL(location);
    const internalHostnames = new Set(["registry", "127.0.0.1", "localhost"]);
    const internalPorts = new Set(["5000", ""]);

    if (
      internalHostnames.has(parsed.hostname) &&
      internalPorts.has(parsed.port)
    ) {
      const publicUrl = new URL(normalizedPublic);
      parsed.protocol = publicUrl.protocol;
      parsed.host = publicUrl.host;
      return parsed.toString();
    }
  } catch {
    // Relative Location values are forwarded unchanged.
  }

  return location;
}

export function rewriteResponseHeaderValue(
  headerName: string,
  value: string,
  publicOrigin: string,
): string {
  if (headerName.toLowerCase() === "location") {
    return rewriteRegistryLocation(value, publicOrigin);
  }

  return value;
}
