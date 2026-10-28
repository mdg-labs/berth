// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { rotatePersonalAccessToken } from "@/lib/pat/store";

const { selectMock, updateMock, getPatPolicyMock, writeAuditLogMock } =
  vi.hoisted(() => ({
    selectMock: vi.fn(),
    updateMock: vi.fn(),
    getPatPolicyMock: vi.fn(),
    writeAuditLogMock: vi.fn(),
  }));

vi.mock("@/lib/db", () => {
  const db = {
    select: selectMock,
    update: updateMock,
    transaction: async (run: (tx: unknown) => Promise<unknown>) => run(db),
  };
  return { getDb: () => db };
});

vi.mock("@/lib/pat/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/pat/config")>();
  return { ...actual, getPatPolicy: getPatPolicyMock };
});

vi.mock("@/lib/audit/log", () => ({
  writeAuditLog: writeAuditLogMock,
}));

const existingRow = {
  id: "pat-1",
  userId: "user-1",
  name: "ci",
  tokenPrefix: "bt_oldprefix",
  tokenHash: "old-hash",
  allowPull: true,
  allowPush: false,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  expiryLifetimeSeconds: 30 * 24 * 60 * 60,
  lastUsedAt: null,
  revokedAt: null,
};

function mockExistingRow() {
  const limit = vi.fn().mockResolvedValue([existingRow]);
  const where = vi.fn().mockReturnValue({ limit });
  selectMock.mockReturnValue({ from: vi.fn().mockReturnValue({ where }) });
}

function mockUpdate(rows: unknown[]) {
  const returning = vi.fn().mockResolvedValue(rows);
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });
  updateMock.mockReturnValue({ set });
  return { set, where };
}

describe("rotatePersonalAccessToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPatPolicyMock.mockResolvedValue({
      patMaxValidityDays: null,
      patAllowNeverExpire: true,
    });
    writeAuditLogMock.mockResolvedValue(undefined);
    mockExistingRow();
  });

  it("returns not_found when the token changed between the read and the update", async () => {
    mockUpdate([]);

    const result = await rotatePersonalAccessToken("user-1", "pat-1", {});

    expect(result).toEqual({ ok: false, error: "not_found" });
    expect(writeAuditLogMock).not.toHaveBeenCalled();
    expect(selectMock).toHaveBeenCalledTimes(1);
  });

  it("restricts the update to the owner, an unrevoked token and the hash that was read", async () => {
    const { where } = mockUpdate([]);

    await rotatePersonalAccessToken("user-1", "pat-1", {});

    const { sql, params } = new PgDialect().sqlToQuery(
      where.mock.calls[0]![0],
    );
    expect(sql).toContain('"personal_access_tokens"."id" = $');
    expect(sql).toContain('"personal_access_tokens"."user_id" = $');
    expect(sql).toContain('"personal_access_tokens"."revoked_at" is null');
    expect(sql).toContain('"personal_access_tokens"."token_hash" = $');
    expect(params).toEqual(["pat-1", "user-1", "old-hash"]);
  });

  it("resets to the stored lifetime rather than the time since creation", async () => {
    getPatPolicyMock.mockResolvedValue({
      patMaxValidityDays: 30,
      patAllowNeverExpire: true,
    });
    const { set } = mockUpdate([]);

    await rotatePersonalAccessToken("user-1", "pat-1", { resetExpiry: true });

    const written = set.mock.calls[0]![0] as { expiresAt: Date };
    expect(
      Math.abs(written.expiresAt.getTime() - (Date.now() + 30 * 24 * 60 * 60 * 1000)),
    ).toBeLessThan(5000);
    expect(set.mock.calls[0]![0]).not.toHaveProperty("expiryLifetimeSeconds");
  });
});
