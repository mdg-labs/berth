// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import {
  publicGuestAllowsScopeAction,
  roleAllowsAction,
  roleAllowsScopeAction,
} from "./matrix";
import type {
  ProjectAction,
  ProjectRole,
  RegistryScopeAction,
  SystemRole,
} from "./types";

export function isSystemAdmin(systemRole: SystemRole): boolean {
  return systemRole === "admin";
}

export function canPerformProjectAction(
  systemRole: SystemRole,
  projectRole: ProjectRole | null,
  action: ProjectAction,
): boolean {
  if (isSystemAdmin(systemRole)) {
    return true;
  }

  return roleAllowsAction(projectRole, action);
}

export function filterScopeActionsForRole(
  actions: string[],
  role: ProjectRole | null,
): string[] {
  const filtered: string[] = [];

  for (const action of actions) {
    if (!isRegistryScopeAction(action)) {
      continue;
    }

    if (roleAllowsScopeAction(role, action)) {
      filtered.push(action);
    }
  }

  return filtered;
}

export function filterScopeActionsForPublicPull(actions: string[]): string[] {
  const filtered: string[] = [];

  for (const action of actions) {
    if (!isRegistryScopeAction(action)) {
      continue;
    }

    if (publicGuestAllowsScopeAction(action)) {
      filtered.push(action);
    }
  }

  return filtered;
}

export function isPublicPullOnlyAccess(
  access: { type: string; actions: string[] }[],
): boolean {
  if (access.length === 0) {
    return false;
  }

  for (const entry of access) {
    if (entry.type !== "repository") {
      return false;
    }

    const pullOnly = filterScopeActionsForPublicPull(entry.actions);
    if (pullOnly.length !== entry.actions.length || pullOnly.length === 0) {
      return false;
    }
  }

  return true;
}

function isRegistryScopeAction(action: string): action is RegistryScopeAction {
  return action === "pull" || action === "push" || action === "delete";
}
