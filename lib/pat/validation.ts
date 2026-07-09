// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import type { PatPolicy } from "@/lib/pat/config";
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
  | "insufficient_repository_access";

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
