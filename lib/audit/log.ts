// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { auditLog, users } from "@/lib/db/schema";

import type { AuditAction } from "./actions";

export function actorSnapshot(userId: string | null) {
  if (userId === null) {
    return { actorEmail: null, actorName: null };
  }

  return {
    actorEmail: sql<string>`(select ${users.email} from ${users} where ${users.id} = ${userId}::uuid)`,
    actorName: sql<string>`(select ${users.name} from ${users} where ${users.id} = ${userId}::uuid)`,
  };
}

export type AuditExecutor = Pick<ReturnType<typeof getDb>, "insert">;

export async function writeAuditLog(
  params: {
    userId: string | null;
    machineAccountId?: string | null;
    action: AuditAction | string;
    resource: string;
    repositoryId?: string | null;
    metadata?: Record<string, unknown> | null;
    clientIp?: string | null;
  },
  executor: AuditExecutor = getDb(),
): Promise<void> {
  await executor.insert(auditLog).values({
    userId: params.userId,
    ...actorSnapshot(params.userId),
    machineAccountId: params.machineAccountId ?? null,
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
