// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import {
  filterScopeActionsForPublicPull,
  filterScopeActionsForRole,
  isPublicPullOnlyAccess,
  isSystemAdmin,
} from "@/lib/rbac/check";
import {
  getEffectiveProjectRole,
  getProjectByName,
} from "@/lib/rbac/roles";
import {
  computeEffectiveAnonymousPull,
  getRepositoryOverridesForProject,
} from "@/lib/repositories/settings";
import type { RegistryAccess } from "@/lib/token/scope";
import { parseRepositoryScopeName } from "@/lib/token/scope";

import { findMissingProjects } from "./projects";

export type TokenAuthUser = {
  id: string;
  email: string;
  systemRole: "admin" | "user";
};

export type AuthorizeTokenResult =
  | { ok: true; access: RegistryAccess[] }
  | { ok: false; code: "project_not_found" | "forbidden"; message: string };

export async function authorizeTokenAccess(
  user: TokenAuthUser | null,
  access: RegistryAccess[],
): Promise<AuthorizeTokenResult> {
  const missingProjects = await findMissingProjects(access);
  if (missingProjects.length > 0) {
    return {
      ok: false,
      code: "project_not_found",
      message: `Project not found: ${missingProjects.join(", ")}`,
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
      const parsed = parseRepositoryScopeName(entry.name);
      return parsed ? { entry, ...parsed } : null;
    })
    .filter((scope): scope is NonNullable<typeof scope> => scope !== null);

  const projectsByName = new Map<
    string,
    Awaited<ReturnType<typeof getProjectByName>>
  >();

  for (const scope of repoScopes) {
    if (projectsByName.has(scope.projectName)) {
      continue;
    }

    const project = await getProjectByName(scope.projectName);
    if (!project) {
      return {
        ok: false,
        code: "forbidden",
        message: `Project is not public: ${scope.projectName}`,
      };
    }

    projectsByName.set(scope.projectName, project);
  }

  const reposByProjectId = new Map<string, string[]>();
  for (const scope of repoScopes) {
    const project = projectsByName.get(scope.projectName);
    if (!project) {
      continue;
    }

    const existing = reposByProjectId.get(project.id) ?? [];
    existing.push(scope.repoName);
    reposByProjectId.set(project.id, existing);
  }

  const overridesByProjectId = new Map<
    string,
    Awaited<ReturnType<typeof getRepositoryOverridesForProject>>
  >();

  for (const [projectId, repoNames] of reposByProjectId) {
    overridesByProjectId.set(
      projectId,
      await getRepositoryOverridesForProject(projectId, repoNames),
    );
  }

  for (const scope of repoScopes) {
    const project = projectsByName.get(scope.projectName);
    if (!project) {
      continue;
    }

    const override =
      overridesByProjectId.get(project.id)?.get(scope.repoName) ?? "inherit";
    const allowed = computeEffectiveAnonymousPull(project.isPublic, override);

    if (!allowed) {
      return {
        ok: false,
        code: "forbidden",
        message: `Anonymous pull is not allowed for repository: ${scope.entry.name}`,
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

    const parsed = parseRepositoryScopeName(entry.name);
    const projectName = parsed?.projectName ?? entry.name;

    if (!projectName) {
      continue;
    }

    const project = await getProjectByName(projectName);
    if (!project) {
      return {
        ok: false,
        code: "project_not_found",
        message: `Project not found: ${projectName}`,
      };
    }

    const effectiveRole = await getEffectiveProjectRole(
      user.id,
      user.systemRole,
      project,
    );

    if (effectiveRole === "bypass") {
      filtered.push(entry);
      continue;
    }

    if (!effectiveRole) {
      return {
        ok: false,
        code: "forbidden",
        message: `No access to project: ${projectName}`,
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
        message: `Insufficient permissions for project: ${projectName}`,
      };
    }

    filtered.push({
      ...entry,
      actions: allowedActions,
    });
  }

  return { ok: true, access: filtered };
}
