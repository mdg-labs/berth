// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { describe, expect, it } from "vitest";

import { parseRepoApiPath } from "@/lib/registry/catalog/parse-path";

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
  });
});
