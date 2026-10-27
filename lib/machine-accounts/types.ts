// Copyright (c) 2026 Michael David Guggenbichler (MDG Labs), licensed under Apache-2.0 — see LICENSE

export type MachineAccountSummary = {
  id: string;
  name: string;
  description: string | null;
  username: string;
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

export type ResolvedMachineAccount = {
  id: string;
  ownerRepositoryId: string | null;
  allowPull: boolean;
  allowPush: boolean;
  repositoryIds: string[];
  lastUsedAt: Date | null;
};
