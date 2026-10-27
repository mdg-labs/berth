// Copyright (c) 2026 Michael David Guggenbichler (MDG Labs), licensed under Apache-2.0 — see LICENSE

export type MachineAccountKind = "repository" | "host";

export type MachineAccountRepositoryRef = { id: string; name: string };

export type MachineAccountSummary = {
  id: string;
  kind: MachineAccountKind;
  name: string;
  description: string | null;
  username: string;
  repositories: MachineAccountRepositoryRef[];
  tokenPrefix: string;
  allowPull: boolean;
  allowPush: boolean;
  createdBy: { id: string; name: string } | null;
  createdAt: string;
};

export type CreateMachineAccountInput = {
  name: string;
  description: string | null;
  allowPull: boolean;
  allowPush: boolean;
};

export type CreateHostMachineAccountInput = {
  name: string;
  description: string | null;
  repositoryIds: string[];
};

export type UpdateHostMachineAccountInput = {
  description?: string | null;
  repositoryIds?: string[];
};

export type MachineAccountSnapshot = {
  id: string;
  name: string;
  kind: MachineAccountKind;
};

export type ResolvedMachineAccount = {
  id: string;
  name: string;
  ownerRepositoryId: string | null;
  allowPull: boolean;
  allowPush: boolean;
  repositoryIds: string[];
  lastUsedAt: Date | null;
};
