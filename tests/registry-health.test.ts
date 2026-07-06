// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { afterEach, describe, expect, it, vi } from "vitest";

import { isRegistryReachable } from "@/lib/registry/health";

describe("isRegistryReachable", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns true when registry responds with 401", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ status: 401, ok: false }),
    );

    await expect(isRegistryReachable("http://registry:5000")).resolves.toBe(
      true,
    );
  });

  it("returns false when registry is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    await expect(isRegistryReachable("http://registry:5000")).resolves.toBe(
      false,
    );
  });
});
