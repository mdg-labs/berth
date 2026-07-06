// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import {
  filterScopeActionsForPublicPull,
  filterScopeActionsForRole,
  isPublicPullOnlyAccess,
  isSystemAdmin,
} from "@/lib/rbac/check";
import {
  getEffectiveRepositoryRole,
  getRepositoryByName,
} from "@/lib/rbac/roles";
import {
  computeEffectiveAnonymousPull,
  getImageOverridesForRepository,
} from "@/lib/repositories/settings";
import type { RegistryAccess } from "@/lib/token/scope";
import { parseRegistryScopePath } from "@/lib/token/scope";

import { findMissingRepositories } from "./repositories";

export type TokenAuthUser = {
  id: string;
  email: string;
  systemRole: "admin" | "user";
};

export type AuthorizeTokenResult =
  | { ok: true; access: RegistryAccess[] }
  | { ok: false; code: "repository_not_found" | "forbidden"; message: string };

export async function authorizeTokenAccess(
  user: TokenAuthUser | null,
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

  if (!user) {
    return authorizePublicPullAccess(access);
  }

  if (isSystemAdmin(user.systemRole)) {
    return { ok: true, access };
  }

  return authorizeAuthenticatedAccess(user, access);
}

async function authorizePublicPullAccess(
  access: RegistryAccess[],
): Promise<AuthorizeTokenResult> {
  if (!isPublicPullOnlyAccess(access)) {
    return {
      ok: false,
      code: "forbidden",
      message: "Authentication required for requested scopes",
    };
  }

  const repoScopes = access
    .filter((entry) => entry.type === "repository")
    .map((entry) => {
      const parsed = parseRegistryScopePath(entry.name);
      return parsed ? { entry, ...parsed } : null;
    })
    .filter((scope): scope is NonNullable<typeof scope> => scope !== null);

  const repositoriesByName = new Map<
    string,
    Awaited<ReturnType<typeof getRepositoryByName>>
  >();

  for (const scope of repoScopes) {
    if (repositoriesByName.has(scope.repositoryName)) {
      continue;
    }

    const repository = await getRepositoryByName(scope.repositoryName);
    if (!repository) {
      return {
        ok: false,
        code: "forbidden",
        message: `Repository is not public: ${scope.repositoryName}`,
      };
    }

    repositoriesByName.set(scope.repositoryName, repository);
  }

  const imagesByRepositoryId = new Map<string, string[]>();
  for (const scope of repoScopes) {
    const repository = repositoriesByName.get(scope.repositoryName);
    if (!repository) {
      continue;
    }

    const existing = imagesByRepositoryId.get(repository.id) ?? [];
    existing.push(scope.imageName);
    imagesByRepositoryId.set(repository.id, existing);
  }

  const overridesByRepositoryId = new Map<
    string,
    Awaited<ReturnType<typeof getImageOverridesForRepository>>
  >();

  for (const [repositoryId, imageNames] of imagesByRepositoryId) {
    overridesByRepositoryId.set(
      repositoryId,
      await getImageOverridesForRepository(repositoryId, imageNames),
    );
  }

  for (const scope of repoScopes) {
    const repository = repositoriesByName.get(scope.repositoryName);
    if (!repository) {
      continue;
    }

    const override =
      overridesByRepositoryId.get(repository.id)?.get(scope.imageName) ?? "inherit";
    const allowed = computeEffectiveAnonymousPull(repository.isPublic, override);

    if (!allowed) {
      return {
        ok: false,
        code: "forbidden",
        message: `Anonymous pull is not allowed for image: ${scope.entry.name}`,
      };
    }
  }

  const filtered = access.map((entry) => ({
    ...entry,
    actions: filterScopeActionsForPublicPull(entry.actions),
  }));

  return { ok: true, access: filtered };
}

async function authorizeAuthenticatedAccess(
  user: TokenAuthUser,
  access: RegistryAccess[],
): Promise<AuthorizeTokenResult> {
  const filtered: RegistryAccess[] = [];

  for (const entry of access) {
    if (entry.type !== "repository") {
      filtered.push(entry);
      continue;
    }

    const parsed = parseRegistryScopePath(entry.name);
    const repositoryName = parsed?.repositoryName ?? entry.name;

    if (!repositoryName) {
      continue;
    }

    const repository = await getRepositoryByName(repositoryName);
    if (!repository) {
      return {
        ok: false,
        code: "repository_not_found",
        message: `Repository not found: ${repositoryName}`,
      };
    }

    const effectiveRole = await getEffectiveRepositoryRole(
      user.id,
      user.systemRole,
      repository,
    );

    if (effectiveRole === "bypass") {
      filtered.push(entry);
      continue;
    }

    if (!effectiveRole) {
      return {
        ok: false,
        code: "forbidden",
        message: `No access to repository: ${repositoryName}`,
      };
    }

    const allowedActions = filterScopeActionsForRole(
      entry.actions,
      effectiveRole,
    );

    if (allowedActions.length === 0) {
      return {
        ok: false,
        code: "forbidden",
        message: `Insufficient permissions for repository: ${repositoryName}`,
      };
    }

    filtered.push({
      ...entry,
      actions: allowedActions,
    });
  }

  return { ok: true, access: filtered };
}
