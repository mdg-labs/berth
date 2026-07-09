// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isPasswordAuthAllowedForUser } from "@/lib/pat/password-auth";

const { getUserMfaEnabledAtMock } = vi.hoisted(() => ({
  getUserMfaEnabledAtMock: vi.fn(),
}));

vi.mock("@/lib/mfa/store", () => ({
  getUserMfaEnabledAt: getUserMfaEnabledAtMock,
}));

describe("password auth policy with MFA", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("allows password auth when MFA is disabled", async () => {
    getUserMfaEnabledAtMock.mockResolvedValue(null);
    await expect(
      isPasswordAuthAllowedForUser({
        id: "user-1",
        email: "user@example.com",
      }),
    ).resolves.toBe(true);
  });

  it("blocks password auth when MFA is enabled", async () => {
    getUserMfaEnabledAtMock.mockResolvedValue(new Date());
    await expect(
      isPasswordAuthAllowedForUser({
        id: "user-1",
        email: "user@example.com",
      }),
    ).resolves.toBe(false);
  });
});
