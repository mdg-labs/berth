// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  acceptUserInvite,
  createUserInvite,
  listPendingUserInvites,
  validateUserInvite,
} from "@/lib/admin/invites";
import { hashToken } from "@/lib/email/tokens";

const {
  selectMock,
  insertMock,
  updateMock,
  findUserByEmailMock,
  hashPasswordMock,
  trySendEmailMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  selectMock: vi.fn(),
  insertMock: vi.fn(),
  updateMock: vi.fn(),
  findUserByEmailMock: vi.fn(),
  hashPasswordMock: vi.fn(),
  trySendEmailMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: selectMock,
    insert: insertMock,
    update: updateMock,
  }),
}));

vi.mock("@/lib/auth/credentials", () => ({
  findUserByEmail: findUserByEmailMock,
  hashPassword: hashPasswordMock,
}));

vi.mock("@/lib/email/send", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/email/send")>();
  return {
    ...actual,
    trySendEmail: trySendEmailMock,
  };
});

vi.mock("@/lib/audit/log", () => ({
  writeAuditLog: writeAuditLogMock,
}));

function mockPendingInviteLookup(row: unknown | null) {
  const limit = vi.fn().mockResolvedValue(row ? [row] : []);
  const where = vi.fn().mockReturnValue({ limit });
  selectMock.mockReturnValue({ from: vi.fn().mockReturnValue({ where }) });
}

describe("user invites", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findUserByEmailMock.mockResolvedValue(null);
    trySendEmailMock.mockResolvedValue({ sent: true });
    hashPasswordMock.mockResolvedValue("hashed-password");
    writeAuditLogMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates invite and sends email", async () => {
    mockPendingInviteLookup(null);
    insertMock.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          {
            id: "invite-1",
            email: "new@example.com",
            name: "New User",
            systemRole: "user",
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
            acceptedAt: null,
          },
        ]),
      }),
    });

    const result = await createUserInvite("admin-1", {
      email: "new@example.com",
      name: "New User",
    });

    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.invite.email).toBe("new@example.com");
      expect(result.emailStatus).toBe("sent");
      expect(result.invite.expired).toBe(false);
    }
    expect(trySendEmailMock).toHaveBeenCalled();
  });

  it("keeps invite when email delivery fails", async () => {
    mockPendingInviteLookup(null);
    trySendEmailMock.mockResolvedValue({ sent: false, reason: "failed" });
    insertMock.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          {
            id: "invite-1",
            email: "new@example.com",
            name: "New User",
            systemRole: "user",
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
            acceptedAt: null,
          },
        ]),
      }),
    });

    const result = await createUserInvite("admin-1", {
      email: "new@example.com",
      name: "New User",
    });

    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.emailStatus).toBe("failed");
    }
  });

  it("lists pending invites with expired flag", async () => {
    const past = new Date("2020-01-01T00:00:00.000Z");
    const where = vi.fn().mockResolvedValue([
      {
        id: "invite-1",
        email: "pending@example.com",
        name: "Pending User",
        systemRole: "user",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        expiresAt: past,
        acceptedAt: null,
      },
    ]);
    selectMock.mockReturnValue({
      from: vi.fn().mockReturnValue({ where }),
    });

    const invites = await listPendingUserInvites();
    expect(invites).toHaveLength(1);
    expect(invites[0]?.email).toBe("pending@example.com");
    expect(invites[0]?.expired).toBe(true);
  });

  it("rejects duplicate pending invites", async () => {
    mockPendingInviteLookup({ id: "invite-existing" });

    const result = await createUserInvite("admin-1", {
      email: "new@example.com",
      name: "New User",
    });

    expect(result).toEqual({ error: "invite_pending" });
  });

  it("validates and accepts invite", async () => {
    const rawToken = "invite-token";
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 60_000);

    const inviteRow = {
      id: "invite-1",
      email: "new@example.com",
      name: "New User",
      systemRole: "user" as const,
      acceptedAt: null,
      expiresAt,
      tokenHash,
    };

    mockPendingInviteLookup(inviteRow);

    const validation = await validateUserInvite(rawToken);
    expect(validation.valid).toBe(true);

    insertMock.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: "user-1" }]),
      }),
    });
    updateMock.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });

    const result = await acceptUserInvite(rawToken, "secure-password");
    expect(result).toEqual({ ok: true, userId: "user-1" });
  });
});
