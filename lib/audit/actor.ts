// Copyright (c) 2026 Michael David Guggenbichler (MDG Labs), licensed under Apache-2.0 — see LICENSE

import type { AuditLogEntry } from "@/lib/audit/query";

export type AuditActorTranslate = (
  key:
    | "actor.system"
    | "actor.machineAccount"
    | "actor.machineAccountDeleted"
    | "actor.deletedUser"
    | "actor.unknown",
  values?: Record<string, string>,
) => string;

export function formatAuditActor(
  actor: AuditLogEntry["actor"],
  t: AuditActorTranslate,
): string {
  const machine = actor.machineAccount;
  if (machine) {
    const name = machine.name ?? machine.id;
    return machine.deleted
      ? t("actor.machineAccountDeleted", { name })
      : t("actor.machineAccount", { name });
  }
  if (actor.email) {
    const label = actor.name ? `${actor.name} (${actor.email})` : actor.email;
    return actor.deletedUser ? t("actor.deletedUser", { actor: label }) : label;
  }
  if (actor.userId === null) {
    return t("actor.system");
  }
  return t("actor.unknown");
}
