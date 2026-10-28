// Copyright (c) 2026 Michael David Guggenbichler (MDG Labs), licensed under Apache-2.0 — see LICENSE

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createPersonalAccessToken,
  listPersonalAccessTokens,
  resolvePersonalAccessToken,
} from "@/lib/pat/store";

const {
  selectMock,
  insertMock,
  getPatPolicyMock,
  writeAuditLogMock,
  listRepositoriesForUserMock,
  getEffectiveRepositoryRoleMock,
} = vi.hoisted(() => ({
  selectMock: vi.fn(),
  insertMock: vi.fn(),
  getPatPolicyMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
  listRepositoriesForUserMock: vi.fn(),
  getEffectiveRepositoryRoleMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getDb: () => ({ select: selectMock, insert: insertMock }),
}));

vi.mock("@/lib/pat/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/pat/config")>();
  return { ...actual, getPatPolicy: getPatPolicyMock };
});

vi.mock("@/lib/audit/log", () => ({ writeAuditLog: writeAuditLogMock }));

vi.mock("@/lib/repositories/service", () => ({
  listRepositoriesForUser: listRepositoriesForUserMock,
}));

vi.mock("@/lib/rbac/roles", () => ({
  getEffectiveRepositoryRole: getEffectiveRepositoryRoleMock,
}));

const tokenRow = {
  id: "pat-1",
  userId: "user-1",
  name: "ci",
  tokenPrefix: "bt_prefix",
  tokenHash: "hash",
  allowPull: true,
  allowPush: false,
  allRepositories: false,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  expiresAt: null,
  lastUsedAt: null,
  revokedAt: null,
};

function mockSelects(...results: unknown[][]) {
  for (const rows of results) {
    const thenable = {
      then: (resolve: (value: unknown[]) => unknown) => resolve(rows),
      orderBy: vi.fn().mockResolvedValue(rows),
      limit: vi.fn().mockResolvedValue(rows),
    };
    const from = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue(thenable),
      innerJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue(thenable),
      }),
    });
    selectMock.mockReturnValueOnce({ from });
  }
}

describe("PAT repository allowlist representation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getPatPolicyMock.mockResolvedValue({
      patMaxValidityDays: null,
      patAllowNeverExpire: true,
    });
    writeAuditLogMock.mockResolvedValue(undefined);
  });

  it("resolves a restricted token whose repositories were all deleted as restricted with no repositories", async () => {
    mockSelects(
      [
        {
          ...tokenRow,
          email: "user@example.com",
          systemRole: "user",
          deletedAt: null,
        },
      ],
      [],
    );

    const resolved = await resolvePersonalAccessToken("bt_secret");

    expect(resolved?.pat.allRepositories).toBe(false);
    expect(resolved?.pat.repositoryIds).toEqual([]);
  });

  it("resolves an unrestricted token as all repositories", async () => {
    mockSelects(
      [
        {
          ...tokenRow,
          allRepositories: true,
          email: "user@example.com",
          systemRole: "user",
          deletedAt: null,
        },
      ],
      [],
    );

    const resolved = await resolvePersonalAccessToken("bt_secret");

    expect(resolved?.pat.allRepositories).toBe(true);
  });

  it("lists a restricted token with no remaining repositories as restricted", async () => {
    mockSelects([tokenRow], []);

    const [summary] = await listPersonalAccessTokens("user-1");

    expect(summary?.allRepositories).toBe(false);
    expect(summary?.repositoryNames).toEqual([]);
  });

  function mockInsert() {
    const returning = vi.fn().mockResolvedValue([tokenRow]);
    const tokenValues = vi.fn().mockReturnValue({ returning });
    const repoValues = vi.fn().mockResolvedValue(undefined);
    insertMock
      .mockReturnValueOnce({ values: tokenValues })
      .mockReturnValueOnce({ values: repoValues });
    return { tokenValues, repoValues };
  }

  const user = { id: "user-1", email: "user@example.com", systemRole: "admin" as const };

  it("creates a token with no allowlist as unrestricted", async () => {
    const { tokenValues } = mockInsert();
    mockSelects([{ ...tokenRow, allRepositories: true }], []);

    const result = await createPersonalAccessToken(user, {
      name: "ci",
      allowPull: true,
      allowPush: false,
      expiresAt: null,
      repositoryIds: null,
    });

    expect(result.ok).toBe(true);
    expect(tokenValues.mock.calls[0]![0].allRepositories).toBe(true);
  });

  it("creates a token with an allowlist as restricted", async () => {
    const { tokenValues, repoValues } = mockInsert();
    listRepositoriesForUserMock.mockResolvedValue([
      { id: "repo-a", name: "a", isPublic: false },
    ]);
    getEffectiveRepositoryRoleMock.mockResolvedValue("bypass");
    mockSelects([tokenRow], [{ tokenId: "pat-1", repositoryId: "repo-a", repositoryName: "a" }]);

    const result = await createPersonalAccessToken(user, {
      name: "ci",
      allowPull: true,
      allowPush: false,
      expiresAt: null,
      repositoryIds: ["repo-a"],
    });

    expect(result.ok).toBe(true);
    expect(tokenValues.mock.calls[0]![0].allRepositories).toBe(false);
    expect(repoValues).toHaveBeenCalledWith([
      { tokenId: "pat-1", repositoryId: "repo-a" },
    ]);
  });
});
