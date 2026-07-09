// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { eq } from "drizzle-orm";

import { writeAuditLog } from "@/lib/audit/log";
import { getDb } from "@/lib/db";
import { systemSettings } from "@/lib/db/schema";

export type SystemSettings = {
  patMaxValidityDays: number | null;
  patAllowNeverExpire: boolean;
  updatedAt: string;
};

const DEFAULT_SETTINGS_ID = "default";

export async function getSystemSettings(): Promise<SystemSettings> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.id, DEFAULT_SETTINGS_ID))
    .limit(1);

  if (!row) {
    const [inserted] = await db
      .insert(systemSettings)
      .values({
        id: DEFAULT_SETTINGS_ID,
        patMaxValidityDays: null,
        patAllowNeverExpire: true,
      })
      .returning();

    if (!inserted) {
      throw new Error("Failed to initialize system settings");
    }

    return {
      patMaxValidityDays: inserted.patMaxValidityDays,
      patAllowNeverExpire: inserted.patAllowNeverExpire,
      updatedAt: inserted.updatedAt.toISOString(),
    };
  }

  return {
    patMaxValidityDays: row.patMaxValidityDays,
    patAllowNeverExpire: row.patAllowNeverExpire,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export type UpdateSystemSettingsInput = {
  patMaxValidityDays?: number | null;
  patAllowNeverExpire?: boolean;
};

export type UpdateSystemSettingsError =
  | "invalid_pat_max_validity_days"
  | "pat_max_validity_days_required_when_never_expire_disabled";

export async function updateSystemSettings(
  adminUserId: string,
  input: UpdateSystemSettingsInput,
  clientIp?: string | null,
): Promise<
  { ok: true; settings: SystemSettings } | { ok: false; error: UpdateSystemSettingsError }
> {
  if (
    input.patMaxValidityDays !== undefined &&
    input.patMaxValidityDays !== null &&
    (!Number.isInteger(input.patMaxValidityDays) || input.patMaxValidityDays < 1)
  ) {
    return { ok: false, error: "invalid_pat_max_validity_days" };
  }

  const current = await getSystemSettings();
  const nextPatMaxValidityDays =
    input.patMaxValidityDays !== undefined
      ? input.patMaxValidityDays
      : current.patMaxValidityDays;
  const nextPatAllowNeverExpire =
    input.patAllowNeverExpire !== undefined
      ? input.patAllowNeverExpire
      : current.patAllowNeverExpire;

  if (!nextPatAllowNeverExpire && nextPatMaxValidityDays === null) {
    return {
      ok: false,
      error: "pat_max_validity_days_required_when_never_expire_disabled",
    };
  }

  const db = getDb();
  const now = new Date();
  const [updated] = await db
    .update(systemSettings)
    .set({
      patMaxValidityDays: nextPatMaxValidityDays,
      patAllowNeverExpire: nextPatAllowNeverExpire,
      updatedAt: now,
      updatedBy: adminUserId,
    })
    .where(eq(systemSettings.id, DEFAULT_SETTINGS_ID))
    .returning();

  if (!updated) {
    const [inserted] = await db
      .insert(systemSettings)
      .values({
        id: DEFAULT_SETTINGS_ID,
        patMaxValidityDays: nextPatMaxValidityDays,
        patAllowNeverExpire: nextPatAllowNeverExpire,
        updatedAt: now,
        updatedBy: adminUserId,
      })
      .returning();

    if (!inserted) {
      throw new Error("Failed to update system settings");
    }

    await writeAuditLog({
      userId: adminUserId,
      action: "system.settings.update",
      resource: "system:settings",
      metadata: {
        patMaxValidityDays: inserted.patMaxValidityDays,
        patAllowNeverExpire: inserted.patAllowNeverExpire,
      },
      clientIp: clientIp ?? null,
    });

    return {
      ok: true,
      settings: {
        patMaxValidityDays: inserted.patMaxValidityDays,
        patAllowNeverExpire: inserted.patAllowNeverExpire,
        updatedAt: inserted.updatedAt.toISOString(),
      },
    };
  }

  await writeAuditLog({
    userId: adminUserId,
    action: "system.settings.update",
    resource: "system:settings",
    metadata: {
      patMaxValidityDays: updated.patMaxValidityDays,
      patAllowNeverExpire: updated.patAllowNeverExpire,
    },
    clientIp: clientIp ?? null,
  });

  return {
    ok: true,
    settings: {
      patMaxValidityDays: updated.patMaxValidityDays,
      patAllowNeverExpire: updated.patAllowNeverExpire,
      updatedAt: updated.updatedAt.toISOString(),
    },
  };
}
