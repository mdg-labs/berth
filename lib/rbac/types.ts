// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

export type SystemRole = "admin" | "user";

export type RepositoryRole = "guest" | "developer" | "maintainer" | "admin";

export type RepositoryAction =
  | "pull"
  | "push"
  | "delete"
  | "manage_members"
  | "delete_repository"
  | "view_repository"
  | "update_repository"
  | "create_repository";

export type RegistryScopeAction = "pull" | "push" | "delete";
