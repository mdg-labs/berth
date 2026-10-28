// Copyright (c) 2026 Michael David Guggenbichler (MDG Labs), licensed under Apache-2.0 — see LICENSE

import { describe, expect, it } from "vitest";

import { formatAuditActor, type AuditActorTranslate } from "@/lib/audit/actor";
import type { AuditLogEntry } from "@/lib/audit/query";
import catalog from "@/messages/en/audit.json";

const t: AuditActorTranslate = (key, values = {}) => {
  const message = key
    .split(".")
    .reduce<unknown>(
      (node, part) => (node as Record<string, unknown>)[part],
      catalog,
    ) as string;
  return message.replace(/\{(\w+)\}/g, (_, name: string) => values[name] ?? "");
};

function actor(overrides: Partial<AuditLogEntry["actor"]>): AuditLogEntry["actor"] {
  return {
    userId: null,
    email: null,
    name: null,
    deletedUser: false,
    machineAccount: null,
    ...overrides,
  };
}

describe("formatAuditActor", () => {
  it("shows a live user by name and email", () => {
    expect(
      formatAuditActor(
        actor({ userId: "u1", email: "alice@example.test", name: "Alice" }),
        t,
      ),
    ).toBe("Alice (alice@example.test)");
  });

  it("shows a purged user as a deleted user with the snapshot, never as System", () => {
    const label = formatAuditActor(
      actor({ email: "alice@example.test", name: "Alice", deletedUser: true }),
      t,
    );
    expect(label).toBe("Deleted user (Alice (alice@example.test))");
    expect(label).not.toBe(t("actor.system"));
  });

  it("shows a purged user whose snapshot has no name by email alone", () => {
    expect(
      formatAuditActor(
        actor({ email: "alice@example.test", deletedUser: true }),
        t,
      ),
    ).toBe("Deleted user (alice@example.test)");
  });

  it("shows an entry with no user and no snapshot as System", () => {
    expect(formatAuditActor(actor({}), t)).toBe("System");
  });

  it("shows a machine account by name and a deleted one as deleted", () => {
    const machine = { id: "m1", name: "ci", kind: "host" as const };
    expect(
      formatAuditActor(
        actor({ machineAccount: { ...machine, deleted: false } }),
        t,
      ),
    ).toBe("Machine account ci");
    expect(
      formatAuditActor(
        actor({ machineAccount: { ...machine, deleted: true } }),
        t,
      ),
    ).toBe("Machine account ci (deleted)");
  });
});
