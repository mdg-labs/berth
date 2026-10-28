// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import type { PatPolicy } from "@/lib/pat/config";
import { resetExpiryLifetimeMs } from "@/lib/pat/expiry-reset";
import type { CreatePersonalAccessTokenInput } from "@/lib/pat/types";
import { roleAllowsAction } from "@/lib/rbac/matrix";
import type { RepositoryRole } from "@/lib/rbac/types";

export type PatValidationError =
  | "name_required"
  | "scope_required"
  | "never_expire_not_allowed"
  | "expiry_required"
  | "expiry_in_past"
  | "expiry_exceeds_max"
  | "invalid_repository"
  | "insufficient_repository_access"
  | "token_expired";

export type ComputeRotatedPatExpiryResult =
  | { ok: true; expiresAt: Date | null }
  | { ok: false; error: PatValidationError };

export function validatePatExpiry(
  expiresAt: string | null,
  policy: PatPolicy,
): PatValidationError | null {
  if (expiresAt === null) {
    if (!policy.patAllowNeverExpire) {
      return "never_expire_not_allowed";
    }
    return null;
  }

  const expiry = new Date(expiresAt);
  if (Number.isNaN(expiry.getTime())) {
    return "expiry_in_past";
  }

  if (expiry.getTime() <= Date.now()) {
    return "expiry_in_past";
  }

  if (policy.patMaxValidityDays !== null) {
    const maxExpiry = new Date(
      Date.now() + policy.patMaxValidityDays * 24 * 60 * 60 * 1000,
    );
    if (expiry.getTime() > maxExpiry.getTime()) {
      return "expiry_exceeds_max";
    }
  }

  return null;
}

export function expiryLifetimeSeconds(
  expiresAt: Date | null,
  from: Date,
): number | null {
  if (expiresAt === null) {
    return null;
  }
  return Math.max(Math.floor((expiresAt.getTime() - from.getTime()) / 1000), 0);
}

export function computeRotatedPatExpiry(
  credential: {
    createdAt: Date;
    expiresAt: Date | null;
    expiryLifetimeSeconds: number | null;
  },
  resetExpiry: boolean,
  policy: PatPolicy,
): ComputeRotatedPatExpiryResult {
  const { expiresAt } = credential;
  if (!resetExpiry) {
    if (expiresAt && expiresAt.getTime() <= Date.now()) {
      return { ok: false, error: "token_expired" };
    }
    return { ok: true, expiresAt };
  }

  if (expiresAt === null) {
    if (!policy.patAllowNeverExpire) {
      return { ok: false, error: "never_expire_not_allowed" };
    }
    return { ok: true, expiresAt: null };
  }

  const ttlMs = resetExpiryLifetimeMs(credential) ?? 0;
  const newExpiresAt = new Date(Date.now() + ttlMs);
  const validationError = validatePatExpiry(newExpiresAt.toISOString(), policy);
  if (validationError) {
    return { ok: false, error: validationError };
  }

  return { ok: true, expiresAt: newExpiresAt };
}

export function validatePatCreateInput(
  input: CreatePersonalAccessTokenInput,
  policy: PatPolicy,
): PatValidationError | null {
  if (!input.name.trim()) {
    return "name_required";
  }

  if (!input.allowPull && !input.allowPush) {
    return "scope_required";
  }

  return validatePatExpiry(input.expiresAt, policy);
}

export function repositoryMeetsPatRequirements(
  role: RepositoryRole | null,
  allowPull: boolean,
  allowPush: boolean,
): boolean {
  if (!role) {
    return false;
  }

  if (allowPull && !roleAllowsAction(role, "pull")) {
    return false;
  }

  if (allowPush && !roleAllowsAction(role, "push")) {
    return false;
  }

  return true;
}
