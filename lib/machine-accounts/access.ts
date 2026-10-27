// Copyright (c) 2026 Michael David Guggenbichler (MDG Labs), licensed under Apache-2.0 — see LICENSE

import { isUuid } from "@/lib/machine-accounts/validation";
import { canPerformRepositoryAction } from "@/lib/rbac/check";
import {
  getRepositoryById,
  getRepositoryMemberRole,
  type RepositoryContext,
} from "@/lib/rbac/roles";
import type { SystemRole } from "@/lib/rbac/types";

export type MachineAccountAccessResult =
  | { ok: true; repository: RepositoryContext }
  | { ok: false; error: "not_found" | "forbidden" };

export async function requireMachineAccountAdmin(
  repositoryId: string,
  user: { id: string; systemRole: SystemRole },
): Promise<MachineAccountAccessResult> {
  if (!isUuid(repositoryId)) {
    return { ok: false, error: "not_found" };
  }

  const repository = await getRepositoryById(repositoryId);
  if (!repository) {
    return { ok: false, error: "not_found" };
  }

  const role = await getRepositoryMemberRole(user.id, repository.id);
  if (!canPerformRepositoryAction(user.systemRole, role, "manage_members")) {
    return { ok: false, error: "forbidden" };
  }

  return { ok: true, repository };
}
