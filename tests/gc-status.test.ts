// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { describe, expect, it } from "vitest";

import { formatBytes } from "@/lib/gc/volume-size";
import { buildGcCommand } from "@/lib/gc/status";

describe("gc volume helpers", () => {
  it("formats bytes for human display", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KiB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MiB");
  });

  it("builds the documented compose GC command", () => {
    expect(buildGcCommand()).toBe(
      "docker compose -f docker/compose.yml run --rm --entrypoint registry registry garbage-collect --delete-untagged /etc/distribution/config.yml",
    );
  });
});
