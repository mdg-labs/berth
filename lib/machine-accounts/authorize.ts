// Copyright (c) 2026 Michael David Guggenbichler (MDG Labs), licensed under Apache-2.0 — see LICENSE

import type { ResolvedMachineAccount } from "@/lib/machine-accounts/types";
import { getRepositoryByName } from "@/lib/rbac/roles";
import {
  computeEffectiveAnonymousPull,
  getImageOverridesForRepository,
} from "@/lib/repositories/settings";
import { findMissingRepositories } from "@/lib/token/repositories";
import type { RegistryAccess } from "@/lib/token/scope";
import { parseRegistryScopePath } from "@/lib/token/scope";
import type { AuthorizeTokenResult } from "@/lib/token/authorize";

export type MachineTokenAccount = Pick<
  ResolvedMachineAccount,
  "ownerRepositoryId" | "allowPull" | "allowPush" | "repositoryIds"
>;

export async function authorizeMachineTokenAccess(
  account: MachineTokenAccount,
  access: RegistryAccess[],
): Promise<AuthorizeTokenResult> {
  const missingRepositories = await findMissingRepositories(access);
  if (missingRepositories.length > 0) {
    return {
      ok: false,
      code: "repository_not_found",
      message: `Repository not found: ${missingRepositories.join(", ")}`,
    };
  }

  if (access.length === 0) {
    return { ok: true, access: [] };
  }

  const ownRepositoryIds = new Set(account.repositoryIds);
  const granted: RegistryAccess[] = [];

  for (const entry of access) {
    if (entry.type !== "repository") {
      continue;
    }

    const parsed = parseRegistryScopePath(entry.name);
    if (!parsed) {
      continue;
    }

    const repository = await getRepositoryByName(parsed.repositoryName);
    if (!repository) {
      return {
        ok: false,
        code: "repository_not_found",
        message: `Repository not found: ${parsed.repositoryName}`,
      };
    }

    const actions: string[] = [];

    if (ownRepositoryIds.has(repository.id)) {
      for (const action of new Set(entry.actions)) {
        if (action === "pull" && account.allowPull) {
          actions.push(action);
        } else if (
          action === "push" &&
          account.allowPush &&
          repository.id === account.ownerRepositoryId
        ) {
          actions.push(action);
        }
      }
    } else if (entry.actions.includes("pull")) {
      const overrides = await getImageOverridesForRepository(repository.id, [
        parsed.imageName,
      ]);
      const override = overrides.get(parsed.imageName) ?? "inherit";
      if (computeEffectiveAnonymousPull(repository.isPublic, override)) {
        actions.push("pull");
      }
    }

    if (actions.length > 0) {
      granted.push({ ...entry, actions });
    }
  }

  if (granted.length === 0) {
    return {
      ok: false,
      code: "forbidden",
      message: "Machine account does not grant the requested scopes",
    };
  }

  return { ok: true, access: granted };
}
