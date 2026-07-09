// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateSync } from "otplib";

import {
  hashBackupCode,
  normalizeBackupCode,
  replaceBackupCodesForUser,
  verifyAndConsumeBackupCode,
} from "@/lib/mfa/backup-codes";
import { encryptTotpSecret } from "@/lib/mfa/crypto";

const { selectMock, insertMock, updateMock, deleteMock } = vi.hoisted(() => ({
  selectMock: vi.fn(),
  insertMock: vi.fn(),
  updateMock: vi.fn(),
  deleteMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: selectMock,
    insert: insertMock,
    update: updateMock,
    delete: deleteMock,
  }),
}));

function mockSelectRows(rows: unknown[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  selectMock.mockReturnValue({ from });
  return { limit, where, from };
}

describe("mfa backup codes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deleteMock.mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });
    insertMock.mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });
    updateMock.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("normalizes backup codes", () => {
    expect(normalizeBackupCode(" abcd-1234 ")).toBe("ABCD-1234");
    expect(hashBackupCode("abcd-1234")).toBe(hashBackupCode("ABCD-1234"));
  });

  it("stores and consumes backup codes", async () => {
    mockSelectRows([{ id: "code-1" }]);
    const accepted = await verifyAndConsumeBackupCode("user-1", "ABCD-1234");
    expect(accepted).toBe(true);
    expect(updateMock).toHaveBeenCalled();
  });

  it("rejects invalid backup code format", async () => {
    const accepted = await verifyAndConsumeBackupCode("user-1", "not-a-code");
    expect(accepted).toBe(false);
  });

  it("replaces backup codes for a user", async () => {
    const codes = await replaceBackupCodesForUser("user-1");
    expect(codes).toHaveLength(10);
    expect(deleteMock).toHaveBeenCalled();
    expect(insertMock).toHaveBeenCalled();
  });
});

describe("mfa store helpers", () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = "test-session-secret";
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.SESSION_SECRET;
    vi.restoreAllMocks();
  });

  it("encrypts secrets at rest", async () => {
    const { createTotpSecret } = await import("@/lib/mfa/totp");
    const secret = createTotpSecret();
    const encrypted = encryptTotpSecret(secret);
    const token = generateSync({ secret });

    expect(token).toMatch(/^\d{6}$/);
    expect(encrypted).not.toBe(secret);
  });
});
