// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import type { RepositoryAction, RepositoryRole, RegistryScopeAction } from "./types";

const ROLE_ACTIONS: Record<RepositoryRole, ReadonlySet<RepositoryAction>> = {
  guest: new Set(["pull", "view_repository"]),
  developer: new Set(["pull", "push", "view_repository"]),
  maintainer: new Set(["pull", "push", "delete", "view_repository"]),
  admin: new Set([
    "pull",
    "push",
    "delete",
    "manage_members",
    "delete_repository",
    "view_repository",
    "update_repository",
  ]),
};

const SCOPE_TO_ACTION: Record<RegistryScopeAction, RepositoryAction> = {
  pull: "pull",
  push: "push",
  delete: "delete",
};

export function roleAllowsAction(
  role: RepositoryRole | null,
  action: RepositoryAction,
): boolean {
  if (!role) {
    return false;
  }

  return ROLE_ACTIONS[role].has(action);
}

export function roleAllowsScopeAction(
  role: RepositoryRole | null,
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
  role: RepositoryRole;
  pull: boolean;
  push: boolean;
  delete: boolean;
  manageMembers: boolean;
  manageSettings: boolean;
  deleteRepository: boolean;
}[] = [
  {
    role: "guest",
    pull: true,
    push: false,
    delete: false,
    manageMembers: false,
    manageSettings: false,
    deleteRepository: false,
  },
  {
    role: "developer",
    pull: true,
    push: true,
    delete: false,
    manageMembers: false,
    manageSettings: false,
    deleteRepository: false,
  },
  {
    role: "maintainer",
    pull: true,
    push: true,
    delete: true,
    manageMembers: false,
    manageSettings: false,
    deleteRepository: false,
  },
  {
    role: "admin",
    pull: true,
    push: true,
    delete: true,
    manageMembers: true,
    manageSettings: true,
    deleteRepository: true,
  },
];

export const RBAC_MATRIX_COLUMNS = [
  "pull",
  "push",
  "delete",
  "manageMembers",
  "manageSettings",
  "deleteRepository",
] as const satisfies ReadonlyArray<keyof (typeof RBAC_MATRIX)[number]>;
