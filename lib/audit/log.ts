// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { getDb } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";

import type { AuditAction } from "./actions";

export async function writeAuditLog(params: {
  userId: string | null;
  action: AuditAction | string;
  resource: string;
  repositoryId?: string | null;
  metadata?: Record<string, unknown> | null;
  clientIp?: string | null;
}): Promise<void> {
  const db = getDb();
  await db.insert(auditLog).values({
    userId: params.userId,
    repositoryId: params.repositoryId ?? null,
    action: params.action,
    resource: params.resource,
    metadata: params.metadata ?? null,
    clientIp: params.clientIp ?? null,
  });
}

export function scheduleAuditLog(
  params: Parameters<typeof writeAuditLog>[0],
): void {
  void writeAuditLog(params).catch((error) => {
    console.error("Failed to write audit log", error);
  });
}
