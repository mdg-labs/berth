// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { describe, expect, it } from "vitest";

import { parsePublicImageTagsPath } from "@/lib/public/parse-path";

describe("parsePublicImageTagsPath", () => {
  it("parses image tags list paths", () => {
    expect(parsePublicImageTagsPath(["hello", "tags"])).toEqual({
      imageName: "hello",
    });
  });

  it("parses nested image paths", () => {
    expect(parsePublicImageTagsPath(["api", "server", "tags"])).toEqual({
      imageName: "api/server",
    });
  });

  it("rejects paths without a trailing tags segment", () => {
    expect(parsePublicImageTagsPath(["hello"])).toBeNull();
    expect(parsePublicImageTagsPath(["hello", "v1"])).toBeNull();
  });
});
