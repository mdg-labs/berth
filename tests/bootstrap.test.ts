// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BOOTSTRAP_PASSWORD_BANNER_END,
  BOOTSTRAP_PASSWORD_BANNER_START,
  ensureBootstrapAdmin,
  generateBootstrapPassword,
  hasAdminUser,
  logGeneratedBootstrapPassword,
  resolveBootstrapEmail,
} from "@/lib/bootstrap/admin";

const { selectMock, insertMock, updateMock } = vi.hoisted(() => ({
  selectMock: vi.fn(),
  insertMock: vi.fn(),
  updateMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: selectMock,
    insert: insertMock,
    update: updateMock,
  }),
}));

vi.mock("bcryptjs", () => ({
  hash: vi.fn(async (password: string) => `hashed:${password}`),
}));

function mockSelectChain(rows: unknown[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const where = vi.fn().mockReturnValue({ limit });
  selectMock.mockReturnValue({
    from: vi.fn().mockReturnValue({ where }),
  });
  return { limit, where };
}

describe("bootstrap admin", () => {
  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.BOOTSTRAP_ADMIN_EMAIL;
    delete process.env.BOOTSTRAP_ADMIN_PASSWORD;
  });

  it("resolveBootstrapEmail uses env or default", () => {
    expect(resolveBootstrapEmail()).toBe("admin@localhost");
    process.env.BOOTSTRAP_ADMIN_EMAIL = "ops@example.com";
    expect(resolveBootstrapEmail()).toBe("ops@example.com");
  });

  it("generateBootstrapPassword returns a non-empty string", () => {
    expect(generateBootstrapPassword()).toHaveLength(24);
  });

  it("logGeneratedBootstrapPassword prints the one-time banner", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    logGeneratedBootstrapPassword("secret-password");

    expect(logSpy).toHaveBeenCalledWith(BOOTSTRAP_PASSWORD_BANNER_START);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("secret-password"),
    );
    expect(logSpy).toHaveBeenCalledWith(BOOTSTRAP_PASSWORD_BANNER_END);
  });

  it("hasAdminUser returns true when an admin exists", async () => {
    mockSelectChain([{ id: "user-1" }]);
    await expect(hasAdminUser()).resolves.toBe(true);
  });

  it("hasAdminUser returns false when no admin exists", async () => {
    mockSelectChain([]);
    await expect(hasAdminUser()).resolves.toBe(false);
  });

  it("ensureBootstrapAdmin skips when an admin already exists", async () => {
    mockSelectChain([{ id: "user-1" }]);
    insertMock.mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });

    await expect(ensureBootstrapAdmin()).resolves.toEqual({
      created: false,
      passwordLogged: false,
    });
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("ensureBootstrapAdmin syncs configured password when admin exists", async () => {
    mockSelectChain([{ id: "user-1" }]);
    process.env.BOOTSTRAP_ADMIN_PASSWORD = "configured-password";
    updateMock.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });

    await expect(ensureBootstrapAdmin()).resolves.toEqual({
      created: false,
      passwordLogged: false,
    });
    expect(updateMock).toHaveBeenCalled();
  });

  it("ensureBootstrapAdmin creates admin with configured password", async () => {
    mockSelectChain([]);
    process.env.BOOTSTRAP_ADMIN_PASSWORD = "configured-password";
    insertMock.mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });

    await expect(ensureBootstrapAdmin()).resolves.toEqual({
      created: true,
      passwordLogged: false,
    });

    const values = insertMock.mock.results[0]?.value.values.mock.calls[0]?.[0];
    expect(values).toMatchObject({
      email: "admin@localhost",
      passwordHash: "hashed:configured-password",
      systemRole: "admin",
      mustChangePassword: false,
    });
  });

  it("ensureBootstrapAdmin logs generated password once when unset", async () => {
    mockSelectChain([]);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    insertMock.mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });

    const result = await ensureBootstrapAdmin();

    expect(result).toEqual({ created: true, passwordLogged: true });
    expect(logSpy).toHaveBeenCalledWith(BOOTSTRAP_PASSWORD_BANNER_START);
    expect(logSpy).toHaveBeenCalledWith(BOOTSTRAP_PASSWORD_BANNER_END);

    const values = insertMock.mock.results[0]?.value.values.mock.calls[0]?.[0];
    expect(values.mustChangePassword).toBe(true);
    expect(values.passwordHash).toMatch(/^hashed:/);
  });
});
