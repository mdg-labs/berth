// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import type { RegistryAccess } from "@/lib/token/scope";
import { parseRegistryScopePath } from "@/lib/token/scope";

import type { PatContext } from "./types";

function applyPatActionCeiling(
  access: RegistryAccess[],
  pat: PatContext,
): RegistryAccess[] {
  const filtered: RegistryAccess[] = [];

  for (const entry of access) {
    if (entry.type !== "repository") {
      continue;
    }

    const actions = entry.actions.filter((action) => {
      if (action === "delete") {
        return false;
      }
      if (action === "pull") {
        return pat.allowPull;
      }
      if (action === "push") {
        return pat.allowPush;
      }
      return false;
    });

    if (actions.length === 0) {
      continue;
    }

    filtered.push({
      ...entry,
      actions,
    });
  }

  return filtered;
}

export function filterAccessByPatRepositoryAllowlist(
  access: RegistryAccess[],
  pat: PatContext,
  repositoryNameToId: Map<string, string>,
): RegistryAccess[] {
  let scoped = access;

  if (pat.repositoryIds.length > 0) {
    const allowlist = new Set(pat.repositoryIds);
    scoped = access.filter((entry) => {
      if (entry.type !== "repository") {
        return false;
      }

      const parsed = parseRegistryScopePath(entry.name);
      if (!parsed) {
        return false;
      }

      const repositoryId = repositoryNameToId.get(parsed.repositoryName);
      return repositoryId !== undefined && allowlist.has(repositoryId);
    });
  }

  return applyPatActionCeiling(scoped, pat);
}
