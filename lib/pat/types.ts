// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

export type PersonalAccessTokenSummary = {
  id: string;
  name: string;
  tokenPrefix: string;
  allowPull: boolean;
  allowPush: boolean;
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  repositoryIds: string[];
  repositoryNames: string[];
};

export type CreatePersonalAccessTokenInput = {
  name: string;
  allowPull: boolean;
  allowPush: boolean;
  expiresAt: string | null;
  repositoryIds: string[] | null;
};

export type PatContext = {
  id: string;
  userId: string;
  allowPull: boolean;
  allowPush: boolean;
  repositoryIds: string[];
};
