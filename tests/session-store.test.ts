// Copyright (c) 2026 Michael David Guggenbichler (MDG Labs), licensed under Apache-2.0 — see LICENSE

import { DrizzleQueryError } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { purgeMock, hardDeleteMock, rowsRef } = vi.hoisted(() => ({
  purgeMock: vi.fn(),
  hardDeleteMock: vi.fn(),
  rowsRef: { current: [] as unknown[] },
}));

vi.mock("@/lib/users/lifecycle", () => ({
  purgeExpiredDeletedUsers: purgeMock,
  hardDeleteUser: hardDeleteMock,
}));

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            limit: () => Promise.resolve(rowsRef.current),
          }),
        }),
      }),
    }),
  }),
}));

import { getActiveSession } from "@/lib/session/store";

function sessionRow(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: "session-1",
    userId: "user-1",
    email: "user@example.test",
    name: "User",
    systemRole: "user",
    mustChangePassword: false,
    passwordHash: "hash",
    totpEnabledAt: null,
    deletedAt: null,
    ...overrides,
  };
}

function constraintViolation() {
  const cause = Object.assign(
    new Error('violates foreign key constraint "audit_log_user_id_users_id_fk"'),
    { name: "PostgresError", code: "23503" },
  );
  return new DrizzleQueryError(
    'delete from "users" where "id" = $1 /* audit_log */',
    ["secret-value"],
    cause,
  );
}

describe("getActiveSession purge handling", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    purgeMock.mockReset();
    hardDeleteMock.mockReset();
    rowsRef.current = [sessionRow()];
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("still resolves the session when the purge fails, and logs without the error details", async () => {
    purgeMock.mockRejectedValue(constraintViolation());

    await expect(getActiveSession("session-1")).resolves.toMatchObject({
      id: "user-1",
      email: "user@example.test",
    });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(errorSpy.mock.calls[0]);
    expect(logged).toContain("23503");
    expect(logged).toContain("PostgresError");
    expect(logged).not.toContain("secret-value");
    expect(logged).not.toContain("audit_log");
    expect(logged).not.toContain("delete from");
  });

  it("does not hang on a cyclic cause chain", async () => {
    const a = new Error("a") as Error & { cause?: unknown };
    const b = new Error("b") as Error & { cause?: unknown };
    a.cause = b;
    b.cause = a;
    purgeMock.mockRejectedValue(a);

    await expect(getActiveSession("session-1")).resolves.toMatchObject({
      id: "user-1",
    });
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("keeps an unknown session unauthenticated when the purge fails", async () => {
    purgeMock.mockRejectedValue(constraintViolation());
    rowsRef.current = [];

    await expect(getActiveSession("missing")).resolves.toBeNull();
  });

  it("treats a user past the purge deadline as signed out even when deleting them fails", async () => {
    purgeMock.mockResolvedValue(0);
    hardDeleteMock.mockRejectedValue(constraintViolation());
    rowsRef.current = [
      sessionRow({ deletedAt: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000) }),
    ];

    await expect(getActiveSession("session-1")).resolves.toBeNull();
    expect(hardDeleteMock).toHaveBeenCalledWith("user-1");
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});
