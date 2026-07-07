// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import type { RegistryAuthUser } from "@/lib/registry/client/auth";

/**
 * Server-only registry identity for catalog enumeration.
 * Output is always filtered to effectiveAnonymousPull images before any response.
 */
export const SERVER_REGISTRY_BROWSE_USER: RegistryAuthUser = {
  id: "00000000-0000-0000-0000-000000000000",
  email: "public-browse@internal",
  systemRole: "admin",
};
