// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  systemRole: "admin" | "user";
  mustChangePassword: boolean;
  hasPassword: boolean;
  pendingDeletion: boolean;
  deletedAt: string | null;
  purgesAt: string | null;
};

export type RepositorySummary = {
  id: string;
  name: string;
  isPublic: boolean;
  createdAt: string;
  role: "guest" | "developer" | "maintainer" | "admin" | null;
  imageCount: number;
};
