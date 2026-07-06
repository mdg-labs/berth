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
import type { RegistryAccess } from "@/lib/token/scope";
import { extractProjectNames } from "@/lib/token/scope";

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

  const projectNames = extractProjectNames(access);
  for (const projectName of projectNames) {
    const project = await getProjectByName(projectName);
    if (!project?.isPublic) {
      return {
        ok: false,
        code: "forbidden",
        message: `Project is not public: ${projectName}`,
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

    const slashIndex = entry.name.indexOf("/");
    const projectName =
      slashIndex === -1 ? entry.name : entry.name.slice(0, slashIndex);

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
