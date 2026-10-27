// Copyright (c) 2026 Michael David Guggenbichler (MDG Labs), licensed under Apache-2.0 — see LICENSE

import {
  MACHINE_ACCOUNT_DESCRIPTION_MAX_LENGTH,
  MACHINE_ACCOUNT_MAX_REPOSITORIES,
} from "@/lib/machine-accounts/config";
import type {
  CreateHostMachineAccountInput,
  CreateMachineAccountInput,
  RotateMachineAccountInput,
  UpdateHostMachineAccountInput,
  UpdateMachineAccountInput,
} from "@/lib/machine-accounts/types";
import {
  isValidRepositoryName,
  normalizeRepositoryName,
} from "@/lib/repositories/validation";

export type MachineAccountValidationError =
  | "invalid_body"
  | "invalid_name"
  | "invalid_description"
  | "invalid_permissions"
  | "permission_required"
  | "invalid_expiry"
  | "invalid_disabled"
  | "empty_update";

export type ParseMachineAccountInputResult =
  | { ok: true; input: CreateMachineAccountInput }
  | { ok: false; error: MachineAccountValidationError };

function parseExpiresAt(
  value: unknown,
): { ok: true; expiresAt: string | null } | { ok: false } {
  if (value === undefined || value === null) {
    return { ok: true, expiresAt: null };
  }
  if (typeof value !== "string" || value.trim() === "") {
    return { ok: false };
  }
  return { ok: true, expiresAt: value };
}

export function parseMachineAccountInput(
  body: unknown,
): ParseMachineAccountInputResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "invalid_body" };
  }

  const record = body as Record<string, unknown>;

  if (typeof record.name !== "string") {
    return { ok: false, error: "invalid_name" };
  }
  const name = normalizeRepositoryName(record.name);
  if (!isValidRepositoryName(name)) {
    return { ok: false, error: "invalid_name" };
  }

  let description: string | null = null;
  if (record.description !== undefined && record.description !== null) {
    if (typeof record.description !== "string") {
      return { ok: false, error: "invalid_description" };
    }
    const trimmed = record.description.trim();
    if (trimmed.length > MACHINE_ACCOUNT_DESCRIPTION_MAX_LENGTH) {
      return { ok: false, error: "invalid_description" };
    }
    description = trimmed === "" ? null : trimmed;
  }

  const allowPull = record.allowPull ?? false;
  const allowPush = record.allowPush ?? false;
  if (typeof allowPull !== "boolean" || typeof allowPush !== "boolean") {
    return { ok: false, error: "invalid_permissions" };
  }
  if (!allowPull && !allowPush) {
    return { ok: false, error: "permission_required" };
  }

  const expiry = parseExpiresAt(record.expiresAt);
  if (!expiry.ok) {
    return { ok: false, error: "invalid_expiry" };
  }

  return {
    ok: true,
    input: { name, description, allowPull, allowPush, expiresAt: expiry.expiresAt },
  };
}

export type HostMachineAccountValidationError =
  | MachineAccountValidationError
  | "invalid_repository_ids"
  | "push_not_allowed";

export type ParseHostMachineAccountInputResult =
  | { ok: true; input: CreateHostMachineAccountInput }
  | { ok: false; error: HostMachineAccountValidationError };

export type ParseHostMachineAccountUpdateResult =
  | { ok: true; input: UpdateHostMachineAccountInput }
  | { ok: false; error: HostMachineAccountValidationError };

function parseDescription(
  value: unknown,
): { ok: true; description: string | null } | { ok: false } {
  if (value === undefined || value === null) {
    return { ok: true, description: null };
  }
  if (typeof value !== "string") {
    return { ok: false };
  }
  const trimmed = value.trim();
  if (trimmed.length > MACHINE_ACCOUNT_DESCRIPTION_MAX_LENGTH) {
    return { ok: false };
  }
  return { ok: true, description: trimmed === "" ? null : trimmed };
}

function parseRepositoryIds(value: unknown): string[] | null {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > MACHINE_ACCOUNT_MAX_REPOSITORIES
  ) {
    return null;
  }
  const ids = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string" || !isUuid(entry)) {
      return null;
    }
    ids.add(entry.toLowerCase());
  }
  return [...ids];
}

export function parseHostMachineAccountInput(
  body: unknown,
): ParseHostMachineAccountInputResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "invalid_body" };
  }

  const record = body as Record<string, unknown>;

  if (typeof record.name !== "string") {
    return { ok: false, error: "invalid_name" };
  }
  const name = normalizeRepositoryName(record.name);
  if (!isValidRepositoryName(name)) {
    return { ok: false, error: "invalid_name" };
  }

  const description = parseDescription(record.description);
  if (!description.ok) {
    return { ok: false, error: "invalid_description" };
  }

  const allowPush = record.allowPush ?? false;
  const allowPull = record.allowPull ?? true;
  if (typeof allowPush !== "boolean" || typeof allowPull !== "boolean") {
    return { ok: false, error: "invalid_permissions" };
  }
  if (allowPush) {
    return { ok: false, error: "push_not_allowed" };
  }
  if (!allowPull) {
    return { ok: false, error: "permission_required" };
  }

  const repositoryIds = parseRepositoryIds(record.repositoryIds);
  if (!repositoryIds) {
    return { ok: false, error: "invalid_repository_ids" };
  }

  const expiry = parseExpiresAt(record.expiresAt);
  if (!expiry.ok) {
    return { ok: false, error: "invalid_expiry" };
  }

  return {
    ok: true,
    input: {
      name,
      description: description.description,
      repositoryIds,
      expiresAt: expiry.expiresAt,
    },
  };
}

export type ParseMachineAccountUpdateResult =
  | { ok: true; input: UpdateMachineAccountInput }
  | { ok: false; error: MachineAccountValidationError };

function parseLifecycleFields(
  record: Record<string, unknown>,
  input: UpdateMachineAccountInput,
): MachineAccountValidationError | null {
  if (record.description !== undefined) {
    const description = parseDescription(record.description);
    if (!description.ok) {
      return "invalid_description";
    }
    input.description = description.description;
  }

  if (record.disabled !== undefined) {
    if (typeof record.disabled !== "boolean") {
      return "invalid_disabled";
    }
    input.disabled = record.disabled;
  }

  return null;
}

export function parseMachineAccountUpdate(
  body: unknown,
): ParseMachineAccountUpdateResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "invalid_body" };
  }

  const input: UpdateMachineAccountInput = {};
  const error = parseLifecycleFields(body as Record<string, unknown>, input);
  if (error) {
    return { ok: false, error };
  }

  if (input.description === undefined && input.disabled === undefined) {
    return { ok: false, error: "empty_update" };
  }

  return { ok: true, input };
}

export function parseHostMachineAccountUpdate(
  body: unknown,
): ParseHostMachineAccountUpdateResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "invalid_body" };
  }

  const record = body as Record<string, unknown>;
  const input: UpdateHostMachineAccountInput = {};

  const error = parseLifecycleFields(record, input);
  if (error) {
    return { ok: false, error };
  }

  if (record.repositoryIds !== undefined) {
    const repositoryIds = parseRepositoryIds(record.repositoryIds);
    if (!repositoryIds) {
      return { ok: false, error: "invalid_repository_ids" };
    }
    input.repositoryIds = repositoryIds;
  }

  if (
    input.description === undefined &&
    input.disabled === undefined &&
    input.repositoryIds === undefined
  ) {
    return { ok: false, error: "empty_update" };
  }

  return { ok: true, input };
}

export type RotateMachineAccountBodyError =
  | "invalid_json"
  | "invalid_body"
  | "invalid_reset_expiry"
  | "invalid_expiry"
  | "conflicting_expiry";

export type ParseRotateMachineAccountBodyResult =
  | { ok: true; input: RotateMachineAccountInput }
  | { ok: false; error: RotateMachineAccountBodyError };

export function parseRotateMachineAccountBody(
  raw: string,
): ParseRotateMachineAccountBodyResult {
  let parsed: unknown = {};
  if (raw.trim() !== "") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { ok: false, error: "invalid_json" };
    }
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: "invalid_body" };
  }

  const record = parsed as Record<string, unknown>;
  const input: RotateMachineAccountInput = {};

  if (record.resetExpiry !== undefined) {
    if (typeof record.resetExpiry !== "boolean") {
      return { ok: false, error: "invalid_reset_expiry" };
    }
    input.resetExpiry = record.resetExpiry;
  }

  if (record.expiresAt !== undefined) {
    if (record.expiresAt === null) {
      input.expiresAt = null;
    } else {
      const expiry = parseExpiresAt(record.expiresAt);
      if (!expiry.ok) {
        return { ok: false, error: "invalid_expiry" };
      }
      input.expiresAt = expiry.expiresAt;
    }
  }

  if (input.resetExpiry && input.expiresAt !== undefined) {
    return { ok: false, error: "conflicting_expiry" };
  }

  return { ok: true, input };
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}
