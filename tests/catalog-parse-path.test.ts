// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { describe, expect, it } from "vitest";

import { parseImageApiPath, parseImageDeletePath } from "@/lib/registry/catalog/parse-path";

describe("parseImageApiPath", () => {
  it("parses tag list paths", () => {
    expect(parseImageApiPath(["hello", "tags"])).toEqual({
      kind: "tags-list",
      imageName: "hello",
    });
    expect(parseImageApiPath(["team", "app", "tags"])).toEqual({
      kind: "tags-list",
      imageName: "team/app",
    });
  });

  it("parses tag detail and sibling paths", () => {
    expect(parseImageApiPath(["hello", "tags", "v1.0"])).toEqual({
      kind: "tag-detail",
      imageName: "hello",
      tag: "v1.0",
    });
    expect(parseImageApiPath(["hello", "tags", "v1.0", "siblings"])).toEqual({
      kind: "tag-siblings",
      imageName: "hello",
      tag: "v1.0",
    });
    expect(parseImageApiPath(["hello", "tags", "bulk-delete"])).toEqual({
      kind: "bulk-delete",
      imageName: "hello",
    });
  });
});

describe("parseImageDeletePath", () => {
  it("parses repository delete paths without tags segment", () => {
    expect(parseImageDeletePath(["hello"])).toEqual({ imageName: "hello" });
    expect(parseImageDeletePath(["team", "app"])).toEqual({
      imageName: "team/app",
    });
    expect(parseImageDeletePath(["hello", "tags", "v1.0"])).toBeNull();
    expect(parseImageDeletePath(undefined)).toBeNull();
  });
});
