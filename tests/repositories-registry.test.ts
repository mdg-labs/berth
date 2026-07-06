// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { describe, expect, it } from "vitest";

import { parseRepositoryCatalogEntry } from "@/lib/repositories/catalog-parse";

describe("parseRepositoryCatalogEntry", () => {
  it("maps catalog paths using repository prefix boundaries", () => {
    expect(
      parseRepositoryCatalogEntry("test/hello", new Set(["test"])),
    ).toEqual({
      repositoryName: "test",
      shortName: "hello",
    });
  });

  it("does not treat hyphenated repository names as nested images", () => {
    expect(
      parseRepositoryCatalogEntry("test-repo/hello", new Set(["test"])),
    ).toBeNull();

    expect(
      parseRepositoryCatalogEntry("test-repo/hello", new Set(["test-repo"])),
    ).toEqual({
      repositoryName: "test-repo",
      shortName: "hello",
    });
  });

  it("supports nested image names within a repository", () => {
    expect(
      parseRepositoryCatalogEntry("test/nested/image", new Set(["test"])),
    ).toEqual({
      repositoryName: "test",
      shortName: "nested/image",
    });
  });
});
