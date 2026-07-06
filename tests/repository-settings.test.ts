// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { describe, expect, it } from "vitest";

import { computeEffectiveAnonymousPull } from "@/lib/repositories/settings";

describe("computeEffectiveAnonymousPull", () => {
  it("inherits the project default when override is inherit", () => {
    expect(computeEffectiveAnonymousPull(true, "inherit")).toBe(true);
    expect(computeEffectiveAnonymousPull(false, "inherit")).toBe(false);
  });

  it("allows or denies regardless of project default", () => {
    expect(computeEffectiveAnonymousPull(false, "allow")).toBe(true);
    expect(computeEffectiveAnonymousPull(true, "deny")).toBe(false);
  });
});
