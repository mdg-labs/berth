// Copyright (c) 2026 Michael David Guggenbichler (MDG Labs), licensed under Apache-2.0 — see LICENSE

import { MACHINE_ACCOUNT_DESCRIPTION_MAX_LENGTH } from "@/lib/machine-accounts/config";
import type { CreateMachineAccountInput } from "@/lib/machine-accounts/types";
import {
  isValidRepositoryName,
  normalizeRepositoryName,
} from "@/lib/repositories/validation";

export type MachineAccountValidationError =
  | "invalid_body"
  | "invalid_name"
  | "invalid_description"
  | "invalid_permissions"
  | "permission_required";

export type ParseMachineAccountInputResult =
  | { ok: true; input: CreateMachineAccountInput }
  | { ok: false; error: MachineAccountValidationError };

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

  return { ok: true, input: { name, description, allowPull, allowPush } };
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}
