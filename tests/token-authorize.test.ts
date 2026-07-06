// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { afterEach, describe, expect, it, vi } from "vitest";

import { authorizeTokenAccess } from "@/lib/token/authorize";

const {
  findMissingRepositoriesMock,
  getRepositoryByNameMock,
  getEffectiveRepositoryRoleMock,
  getImageOverridesForRepositoryMock,
} = vi.hoisted(() => ({
  findMissingRepositoriesMock: vi.fn(),
  getRepositoryByNameMock: vi.fn(),
  getEffectiveRepositoryRoleMock: vi.fn(),
  getImageOverridesForRepositoryMock: vi.fn(),
}));

vi.mock("@/lib/token/repositories", () => ({
  findMissingRepositories: findMissingRepositoriesMock,
  repositoryExists: vi.fn(),
}));

vi.mock("@/lib/rbac/roles", () => ({
  getRepositoryByName: getRepositoryByNameMock,
  getEffectiveRepositoryRole: getEffectiveRepositoryRoleMock,
  getRepositoryMemberRole: vi.fn(),
  getRepositoryById: vi.fn(),
}));

vi.mock("@/lib/repositories/settings", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/repositories/settings")>();
  return {
    ...actual,
    getImageOverridesForRepository: getImageOverridesForRepositoryMock,
  };
});

describe("token authorization", () => {
  afterEach(() => {
    vi.clearAllMocks();
    getImageOverridesForRepositoryMock.mockResolvedValue(new Map());
  });

  it("rejects missing repositories", async () => {
    findMissingRepositoriesMock.mockResolvedValue(["missing"]);

    const result = await authorizeTokenAccess(
      { id: "u1", email: "a@b.com", systemRole: "user" },
      [{ type: "repository", name: "missing/repo", actions: ["pull"] }],
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("repository_not_found");
    }
  });

  it("admin bypasses project membership", async () => {
    findMissingRepositoriesMock.mockResolvedValue([]);

    const result = await authorizeTokenAccess(
      { id: "admin", email: "admin@localhost", systemRole: "admin" },
      [
        {
          type: "repository",
          name: "proj/repo",
          actions: ["pull", "push", "delete"],
        },
      ],
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.access[0]?.actions).toEqual(["pull", "push", "delete"]);
    }
  });

  it("developer cannot get delete scope", async () => {
    findMissingRepositoriesMock.mockResolvedValue([]);
    getRepositoryByNameMock.mockResolvedValue({
      id: "p1",
      name: "proj",
      isPublic: false,
    });
    getEffectiveRepositoryRoleMock.mockResolvedValue("developer");

    const result = await authorizeTokenAccess(
      { id: "u1", email: "dev@example.com", systemRole: "user" },
      [
        {
          type: "repository",
          name: "proj/repo",
          actions: ["pull", "push", "delete"],
        },
      ],
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.access[0]?.actions).toEqual(["pull", "push"]);
    }
  });

  it("maintainer gets delete scope", async () => {
    findMissingRepositoriesMock.mockResolvedValue([]);
    getRepositoryByNameMock.mockResolvedValue({
      id: "p1",
      name: "proj",
      isPublic: false,
    });
    getEffectiveRepositoryRoleMock.mockResolvedValue("maintainer");

    const result = await authorizeTokenAccess(
      { id: "u1", email: "maint@example.com", systemRole: "user" },
      [
        {
          type: "repository",
          name: "proj/repo",
          actions: ["delete"],
        },
      ],
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.access[0]?.actions).toEqual(["delete"]);
    }
  });

  it("allows unauthenticated pull on public project", async () => {
    findMissingRepositoriesMock.mockResolvedValue([]);
    getRepositoryByNameMock.mockResolvedValue({
      id: "p1",
      name: "public-proj",
      isPublic: true,
    });

    const result = await authorizeTokenAccess(null, [
      { type: "repository", name: "public-proj/repo", actions: ["pull"] },
    ]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.access[0]?.actions).toEqual(["pull"]);
    }
  });

  it("rejects unauthenticated push on public project", async () => {
    const result = await authorizeTokenAccess(null, [
      { type: "repository", name: "public-proj/repo", actions: ["push"] },
    ]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("forbidden");
    }
  });

  it("rejects anonymous pull when repository override is deny", async () => {
    findMissingRepositoriesMock.mockResolvedValue([]);
    getRepositoryByNameMock.mockResolvedValue({
      id: "p1",
      name: "public-proj",
      isPublic: true,
    });
    getImageOverridesForRepositoryMock.mockResolvedValue(
      new Map([["repo", "deny"]]),
    );

    const result = await authorizeTokenAccess(null, [
      { type: "repository", name: "public-proj/repo", actions: ["pull"] },
    ]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("forbidden");
      expect(result.message).toContain("public-proj/repo");
    }
  });

  it("allows anonymous pull when repository override is allow on private project", async () => {
    findMissingRepositoriesMock.mockResolvedValue([]);
    getRepositoryByNameMock.mockResolvedValue({
      id: "p1",
      name: "private-proj",
      isPublic: false,
    });
    getImageOverridesForRepositoryMock.mockResolvedValue(
      new Map([["repo", "allow"]]),
    );

    const result = await authorizeTokenAccess(null, [
      { type: "repository", name: "private-proj/repo", actions: ["pull"] },
    ]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.access[0]?.actions).toEqual(["pull"]);
    }
  });
});
