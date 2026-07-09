// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { describe, expect, it } from "vitest";

import { filterAccessByPatRepositoryAllowlist } from "@/lib/pat/authorize";
import type { PatContext } from "@/lib/pat/types";

describe("PAT scope authorization", () => {
  const pat: PatContext = {
    id: "pat-1",
    userId: "user-1",
    allowPull: true,
    allowPush: false,
    repositoryIds: ["repo-a-id"],
  };

  const repositoryNameToId = new Map([
    ["repo-a", "repo-a-id"],
    ["repo-b", "repo-b-id"],
  ]);

  it("strips push and delete actions", () => {
    const result = filterAccessByPatRepositoryAllowlist(
      [
        {
          type: "repository",
          name: "repo-a/image",
          actions: ["pull", "push", "delete"],
        },
      ],
      pat,
      repositoryNameToId,
    );

    expect(result).toEqual([
      {
        type: "repository",
        name: "repo-a/image",
        actions: ["pull"],
      },
    ]);
  });

  it("enforces repository allowlist", () => {
    const result = filterAccessByPatRepositoryAllowlist(
      [
        {
          type: "repository",
          name: "repo-b/image",
          actions: ["pull"],
        },
      ],
      pat,
      repositoryNameToId,
    );

    expect(result).toEqual([]);
  });

  it("allows all repositories when allowlist is empty", () => {
    const openPat: PatContext = { ...pat, repositoryIds: [] };
    const result = filterAccessByPatRepositoryAllowlist(
      [
        {
          type: "repository",
          name: "repo-b/image",
          actions: ["pull", "push"],
        },
      ],
      openPat,
      repositoryNameToId,
    );

    expect(result).toEqual([
      {
        type: "repository",
        name: "repo-b/image",
        actions: ["pull"],
      },
    ]);
  });
});
