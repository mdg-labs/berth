// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

export type SystemRole = "admin" | "user";

export type ProjectRole = "guest" | "developer" | "maintainer" | "admin";

export type ProjectAction =
  | "pull"
  | "push"
  | "delete"
  | "manage_members"
  | "delete_project"
  | "view_project"
  | "update_project"
  | "create_project";

export type RegistryScopeAction = "pull" | "push" | "delete";
