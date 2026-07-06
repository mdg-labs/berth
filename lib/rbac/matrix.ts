// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import type { ProjectAction, ProjectRole, RegistryScopeAction } from "./types";

const ROLE_ACTIONS: Record<ProjectRole, ReadonlySet<ProjectAction>> = {
  guest: new Set(["pull", "view_project"]),
  developer: new Set(["pull", "push", "view_project"]),
  maintainer: new Set(["pull", "push", "delete", "view_project"]),
  admin: new Set([
    "pull",
    "push",
    "delete",
    "manage_members",
    "delete_project",
    "view_project",
    "update_project",
  ]),
};

const SCOPE_TO_ACTION: Record<RegistryScopeAction, ProjectAction> = {
  pull: "pull",
  push: "push",
  delete: "delete",
};

export function roleAllowsAction(
  role: ProjectRole | null,
  action: ProjectAction,
): boolean {
  if (!role) {
    return false;
  }

  return ROLE_ACTIONS[role].has(action);
}

export function roleAllowsScopeAction(
  role: ProjectRole | null,
  scopeAction: RegistryScopeAction,
): boolean {
  return roleAllowsAction(role, SCOPE_TO_ACTION[scopeAction]);
}

export function publicGuestAllowsScopeAction(
  scopeAction: RegistryScopeAction,
): boolean {
  return scopeAction === "pull";
}

export const RBAC_MATRIX: {
  role: ProjectRole;
  pull: boolean;
  push: boolean;
  delete: boolean;
  manageMembers: boolean;
  deleteProject: boolean;
}[] = [
  {
    role: "guest",
    pull: true,
    push: false,
    delete: false,
    manageMembers: false,
    deleteProject: false,
  },
  {
    role: "developer",
    pull: true,
    push: true,
    delete: false,
    manageMembers: false,
    deleteProject: false,
  },
  {
    role: "maintainer",
    pull: true,
    push: true,
    delete: true,
    manageMembers: false,
    deleteProject: false,
  },
  {
    role: "admin",
    pull: true,
    push: true,
    delete: true,
    manageMembers: true,
    deleteProject: true,
  },
];
