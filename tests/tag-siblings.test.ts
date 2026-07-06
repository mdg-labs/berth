// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { describe, expect, it } from "vitest";

import { buildSiblingMapForTags } from "@/lib/registry/client/tags";

describe("buildSiblingMapForTags", () => {
  it("groups tags that share the same digest", () => {
    const siblingsByTag = buildSiblingMapForTags([
      { name: "v1.0.0", digest: "sha256:abc" },
      { name: "latest", digest: "sha256:abc" },
      { name: "v0.9.0", digest: "sha256:def" },
    ]);

    expect(siblingsByTag.get("v1.0.0")).toEqual(["latest"]);
    expect(siblingsByTag.get("latest")).toEqual(["v1.0.0"]);
    expect(siblingsByTag.get("v0.9.0")).toEqual([]);
  });

  it("returns empty siblings when digest is missing", () => {
    const siblingsByTag = buildSiblingMapForTags([
      { name: "broken", digest: "" },
      { name: "v1", digest: "sha256:abc" },
    ]);

    expect(siblingsByTag.get("broken")).toEqual([]);
  });
});
