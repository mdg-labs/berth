// Copyright (c) 2026 Michael David Guggenbichler (MDG Labs), licensed under Apache-2.0 — see LICENSE

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  authorizeMachineTokenAccess,
  type MachineTokenAccount,
} from "@/lib/machine-accounts/authorize";

const { findMissingRepositoriesMock, getRepositoryByNameMock, overridesMock } =
  vi.hoisted(() => ({
    findMissingRepositoriesMock: vi.fn(),
    getRepositoryByNameMock: vi.fn(),
    overridesMock: vi.fn(),
  }));

vi.mock("@/lib/token/repositories", () => ({
  findMissingRepositories: findMissingRepositoriesMock,
  repositoryExists: vi.fn(),
}));

vi.mock("@/lib/rbac/roles", () => ({
  getRepositoryByName: getRepositoryByNameMock,
  getEffectiveRepositoryRole: vi.fn(),
  getRepositoryMemberRole: vi.fn(),
  getRepositoryById: vi.fn(),
}));

vi.mock("@/lib/repositories/settings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/repositories/settings")>()),
  getImageOverridesForRepository: overridesMock,
}));

const repositories = {
  own: { id: "repo-own", name: "own", isPublic: false },
  other: { id: "repo-other", name: "other", isPublic: false },
  open: { id: "repo-open", name: "open", isPublic: true },
};

const repositoryAccount: MachineTokenAccount = {
  ownerRepositoryId: "repo-own",
  allowPull: true,
  allowPush: true,
  repositoryIds: ["repo-own"],
};

function scope(name: string, actions: string[], type = "repository") {
  return { type, name, actions };
}

describe("authorizeMachineTokenAccess", () => {
  beforeEach(() => {
    findMissingRepositoriesMock.mockResolvedValue([]);
    overridesMock.mockResolvedValue(new Map());
    getRepositoryByNameMock.mockImplementation(
      async (name: string) =>
        Object.values(repositories).find((repo) => repo.name === name) ?? null,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("grants pull and push on the own repository and never delete", async () => {
    const result = await authorizeMachineTokenAccess(repositoryAccount, [
      scope("own/app", ["pull", "push", "delete"]),
    ]);

    expect(result).toEqual({
      ok: true,
      access: [scope("own/app", ["pull", "push"])],
    });
  });

  it("denies push to a pull-only account on its own repository", async () => {
    const result = await authorizeMachineTokenAccess(
      { ...repositoryAccount, allowPush: false },
      [scope("own/app", ["push"])],
    );

    expect(result).toMatchObject({ ok: false, code: "forbidden" });
  });

  it("grants only push to a push-only account and no pull", async () => {
    const result = await authorizeMachineTokenAccess(
      { ...repositoryAccount, allowPull: false },
      [scope("own/app", ["pull", "push"])],
    );

    expect(result).toEqual({
      ok: true,
      access: [scope("own/app", ["push"])],
    });
  });

  it("denies push on another private repository", async () => {
    const result = await authorizeMachineTokenAccess(repositoryAccount, [
      scope("other/app", ["push"]),
    ]);

    expect(result).toMatchObject({ ok: false, code: "forbidden" });
  });

  it("denies pull on another private repository", async () => {
    const result = await authorizeMachineTokenAccess(repositoryAccount, [
      scope("other/app", ["pull"]),
    ]);

    expect(result).toMatchObject({ ok: false, code: "forbidden" });
  });

  it("grants pull only where anonymous pull is allowed on another repository", async () => {
    const publicRepository = await authorizeMachineTokenAccess(
      repositoryAccount,
      [scope("open/app", ["pull", "push", "delete"])],
    );
    expect(publicRepository).toEqual({
      ok: true,
      access: [scope("open/app", ["pull"])],
    });

    overridesMock.mockResolvedValue(new Map([["shared", "allow"]]));
    const overridden = await authorizeMachineTokenAccess(repositoryAccount, [
      scope("other/shared", ["pull"]),
    ]);
    expect(overridden).toEqual({
      ok: true,
      access: [scope("other/shared", ["pull"])],
    });
    expect(overridesMock).toHaveBeenCalledWith("repo-other", ["shared"]);

    overridesMock.mockResolvedValue(new Map([["secret", "deny"]]));
    const denied = await authorizeMachineTokenAccess(repositoryAccount, [
      scope("open/secret", ["pull"]),
    ]);
    expect(denied).toMatchObject({ ok: false, code: "forbidden" });
  });

  it("drops out-of-list entries instead of failing the request", async () => {
    const result = await authorizeMachineTokenAccess(repositoryAccount, [
      scope("own/app", ["push"]),
      scope("other/lib", ["pull"]),
    ]);

    expect(result).toEqual({
      ok: true,
      access: [scope("own/app", ["push"])],
    });
  });

  it("rejects a missing repository with repository_not_found", async () => {
    findMissingRepositoriesMock.mockResolvedValue(["missing"]);

    const result = await authorizeMachineTokenAccess(repositoryAccount, [
      scope("missing/app", ["push"]),
    ]);

    expect(result).toMatchObject({ ok: false, code: "repository_not_found" });
  });

  it("drops non-repository scopes and denies a request that is left empty", async () => {
    const result = await authorizeMachineTokenAccess(repositoryAccount, [
      scope("catalog", ["*"], "registry"),
    ]);

    expect(result).toMatchObject({ ok: false, code: "forbidden" });

    const mixed = await authorizeMachineTokenAccess(repositoryAccount, [
      scope("catalog", ["*"], "registry"),
      scope("own/app", ["pull"]),
    ]);
    expect(mixed).toEqual({
      ok: true,
      access: [scope("own/app", ["pull"])],
    });
  });

  it("grants an empty request nothing and succeeds", async () => {
    expect(await authorizeMachineTokenAccess(repositoryAccount, [])).toEqual({
      ok: true,
      access: [],
    });
  });

  it("grants nothing on private repositories when the repository list is empty", async () => {
    const empty: MachineTokenAccount = {
      ownerRepositoryId: "repo-own",
      allowPull: true,
      allowPush: true,
      repositoryIds: [],
    };

    const result = await authorizeMachineTokenAccess(empty, [
      scope("own/app", ["pull", "push"]),
      scope("other/app", ["pull", "push"]),
    ]);

    expect(result).toMatchObject({ ok: false, code: "forbidden" });
  });

  it("never grants push to an account without an owner repository", async () => {
    const host: MachineTokenAccount = {
      ownerRepositoryId: null,
      allowPull: true,
      allowPush: true,
      repositoryIds: ["repo-own", "repo-other"],
    };

    const result = await authorizeMachineTokenAccess(host, [
      scope("own/app", ["pull", "push", "delete"]),
      scope("other/app", ["pull", "push"]),
    ]);

    expect(result).toEqual({
      ok: true,
      access: [scope("own/app", ["pull"]), scope("other/app", ["pull"])],
    });
  });
});
