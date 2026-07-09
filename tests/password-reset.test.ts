// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  completePasswordReset,
  requestPasswordReset,
  validatePasswordResetToken,
} from "@/lib/auth/password-reset";
import { hashToken } from "@/lib/email/tokens";

const {
  selectMock,
  insertMock,
  updateMock,
  deleteMock,
  findUserByEmailMock,
  hashPasswordMock,
  trySendEmailMock,
} = vi.hoisted(() => ({
  selectMock: vi.fn(),
  insertMock: vi.fn(),
  updateMock: vi.fn(),
  deleteMock: vi.fn(),
  findUserByEmailMock: vi.fn(),
  hashPasswordMock: vi.fn(),
  trySendEmailMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: selectMock,
    insert: insertMock,
    update: updateMock,
    delete: deleteMock,
  }),
}));

vi.mock("@/lib/auth/credentials", () => ({
  findUserByEmail: findUserByEmailMock,
  hashPassword: hashPasswordMock,
}));

vi.mock("@/lib/email/send", () => ({
  trySendEmail: trySendEmailMock,
}));

function mockSelectChain(rows: unknown[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const where = vi.fn().mockReturnValue({ limit });
  const innerJoin = vi.fn().mockReturnValue({ where });
  const from = vi.fn().mockReturnValue({ where, innerJoin });
  selectMock.mockReturnValue({ from });
  return { limit, where, from, innerJoin };
}

describe("password reset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    trySendEmailMock.mockResolvedValue({ sent: true });
    hashPasswordMock.mockResolvedValue("hashed-password");
    updateMock.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });
    insertMock.mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });
    deleteMock.mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates reset token and sends email for local users", async () => {
    findUserByEmailMock.mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
      passwordHash: "hash",
    });

    const result = await requestPasswordReset("user@example.com");

    expect(result.emailSent).toBe(true);
    expect(insertMock).toHaveBeenCalled();
    expect(trySendEmailMock).toHaveBeenCalled();
  });

  it("skips unknown or OIDC-only users", async () => {
    findUserByEmailMock.mockResolvedValue(null);
    const result = await requestPasswordReset("missing@example.com");
    expect(result.emailSent).toBe(false);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("validates and completes reset with a valid token", async () => {
    const rawToken = "reset-token";
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 60_000);

    mockSelectChain([
      {
        usedAt: null,
        expiresAt,
        email: "user@example.com",
      },
    ]);

    const validation = await validatePasswordResetToken(rawToken);
    expect(validation.valid).toBe(true);

    mockSelectChain([
      {
        id: "token-1",
        userId: "user-1",
        usedAt: null,
        expiresAt,
        tokenHash,
      },
    ]);

    const result = await completePasswordReset(rawToken, "new-password-123");
    expect(result).toEqual({ ok: true });
    expect(hashPasswordMock).toHaveBeenCalledWith("new-password-123");
  });

  it("rejects short passwords", async () => {
    const result = await completePasswordReset("token", "short");
    expect(result).toEqual({ error: "invalid_input" });
  });
});
