// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { describe, expect, it } from "vitest";

import { parseRepoApiPath, parseRepoDeletePath } from "@/lib/registry/catalog/parse-path";

describe("parseRepoApiPath", () => {
  it("parses tag list paths", () => {
    expect(parseRepoApiPath(["hello", "tags"])).toEqual({
      kind: "tags-list",
      repoName: "hello",
    });
    expect(parseRepoApiPath(["team", "app", "tags"])).toEqual({
      kind: "tags-list",
      repoName: "team/app",
    });
  });

  it("parses tag detail and sibling paths", () => {
    expect(parseRepoApiPath(["hello", "tags", "v1.0"])).toEqual({
      kind: "tag-detail",
      repoName: "hello",
      tag: "v1.0",
    });
    expect(parseRepoApiPath(["hello", "tags", "v1.0", "siblings"])).toEqual({
      kind: "tag-siblings",
      repoName: "hello",
      tag: "v1.0",
    });
    expect(parseRepoApiPath(["hello", "tags", "bulk-delete"])).toEqual({
      kind: "bulk-delete",
      repoName: "hello",
    });
  });
});

describe("parseRepoDeletePath", () => {
  it("parses repository delete paths without tags segment", () => {
    expect(parseRepoDeletePath(["hello"])).toEqual({ repoName: "hello" });
    expect(parseRepoDeletePath(["team", "app"])).toEqual({
      repoName: "team/app",
    });
    expect(parseRepoDeletePath(["hello", "tags", "v1.0"])).toBeNull();
    expect(parseRepoDeletePath(undefined)).toBeNull();
  });
});
