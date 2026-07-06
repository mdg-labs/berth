// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { describe, expect, it } from "vitest";

import {
  computePullCounterIncrements,
  getPullDedupeSinceDate,
} from "@/lib/pulls/dedupe";
import { PULL_DEDUPE_WINDOW_MS } from "@/lib/pulls/constants";
import { parseManifestPath } from "@/lib/registry/proxy/parse-manifest-path";

describe("parseManifestPath", () => {
  it("parses tag manifest paths", () => {
    expect(parseManifestPath("/v2/test/hello/manifests/latest")).toEqual({
      repositoryName: "test",
      imageName: "hello",
      reference: "latest",
      isDigestReference: false,
    });
  });

  it("parses nested image paths", () => {
    expect(parseManifestPath("/v2/test/foo/bar/manifests/v1.0.0")).toEqual({
      repositoryName: "test",
      imageName: "foo/bar",
      reference: "v1.0.0",
      isDigestReference: false,
    });
  });

  it("parses digest manifest paths", () => {
    const digest =
      "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    expect(parseManifestPath(`/v2/test/hello/manifests/${digest}`)).toEqual({
      repositoryName: "test",
      imageName: "hello",
      reference: digest,
      isDigestReference: true,
    });
  });

  it("returns null for non-manifest paths", () => {
    expect(parseManifestPath("/v2/test/hello/tags/list")).toBeNull();
    expect(parseManifestPath("/v2/")).toBeNull();
    expect(parseManifestPath("/api/repositories")).toBeNull();
  });
});

describe("computePullCounterIncrements", () => {
  it("increments tag, image, and repository on first pull", () => {
    expect(
      computePullCounterIncrements("latest", {
        hasRecentImageDigestPull: false,
        hasRecentRepositoryDigestPull: false,
      }),
    ).toEqual({ tag: true, image: true, repository: true });
  });

  it("skips image and repository when digest was recently pulled", () => {
    expect(
      computePullCounterIncrements("v1.0.0", {
        hasRecentImageDigestPull: true,
        hasRecentRepositoryDigestPull: true,
      }),
    ).toEqual({ tag: true, image: false, repository: false });
  });

  it("counts digest-only pulls toward image and repository only", () => {
    expect(
      computePullCounterIncrements(null, {
        hasRecentImageDigestPull: false,
        hasRecentRepositoryDigestPull: false,
      }),
    ).toEqual({ tag: false, image: true, repository: true });
  });
});

describe("getPullDedupeSinceDate", () => {
  it("uses the configured dedupe window", () => {
    const now = new Date("2026-01-01T12:00:00.000Z");
    const since = getPullDedupeSinceDate(now);
    expect(now.getTime() - since.getTime()).toBe(PULL_DEDUPE_WINDOW_MS);
  });
});
