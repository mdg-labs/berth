// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { getDb } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";

export async function writeAuditLog(params: {
  userId: string | null;
  action: string;
  resource: string;
}): Promise<void> {
  const db = getDb();
  await db.insert(auditLog).values({
    userId: params.userId,
    action: params.action,
    resource: params.resource,
  });
}
