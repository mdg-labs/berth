// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import type { PatValidationError } from "@/lib/pat/validation";

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

export type RotatePersonalAccessTokenInput = {
  resetExpiry?: boolean;
};

export type RotatePatResult =
  | {
      ok: true;
      token: string;
      summary: PersonalAccessTokenSummary;
    }
  | {
      ok: false;
      error: PatValidationError | "not_found" | "token_expired";
    };

export type PatContext = {
  id: string;
  userId: string;
  allowPull: boolean;
  allowPush: boolean;
  repositoryIds: string[];
};
