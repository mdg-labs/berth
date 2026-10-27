// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { describe, expect, it } from "vitest";

import {
  buildPullCommand,
  isDigestReference,
} from "@/lib/catalog/format";

describe("isDigestReference", () => {
  it("detects sha256 digest references", () => {
    expect(isDigestReference("sha256:abc")).toBe(true);
    expect(isDigestReference("dev")).toBe(false);
  });
});

describe("buildPullCommand", () => {
  it("builds tag-based pull commands", () => {
    expect(buildPullCommand("localhost:8080", "demo", "hello", "dev")).toBe(
      "docker pull localhost:8080/demo/hello:dev",
    );
  });

  it("builds digest-based pull commands", () => {
    expect(
      buildPullCommand(
        "localhost:8080",
        "demo",
        "hello",
        "sha256:abc123",
      ),
    ).toBe("docker pull localhost:8080/demo/hello@sha256:abc123");
  });
});
