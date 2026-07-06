// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import type { ProjectRole, SystemRole } from "@/lib/rbac/types";

export function canDeleteRegistryContent(
  systemRole: SystemRole,
  projectRole: ProjectRole | null,
): boolean {
  if (systemRole === "admin") {
    return true;
  }

  return projectRole === "maintainer" || projectRole === "admin";
}
