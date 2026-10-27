// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { describe, expect, it } from "vitest";

import {
  computeRotatedPatExpiry,
  repositoryMeetsPatRequirements,
  validatePatCreateInput,
  validatePatExpiry,
} from "@/lib/pat/validation";

describe("PAT validation", () => {
  const policy = {
    patMaxValidityDays: 90,
    patAllowNeverExpire: true,
  };

  it("requires a name", () => {
    const result = validatePatCreateInput(
      {
        name: "  ",
        allowPull: true,
        allowPush: false,
        expiresAt: null,
        repositoryIds: null,
      },
      policy,
    );
    expect(result).toBe("name_required");
  });

  it("requires at least one scope", () => {
    const result = validatePatCreateInput(
      {
        name: "CI",
        allowPull: false,
        allowPush: false,
        expiresAt: null,
        repositoryIds: null,
      },
      policy,
    );
    expect(result).toBe("scope_required");
  });

  it("rejects never-expire when policy disallows it", () => {
    const result = validatePatExpiry(null, {
      ...policy,
      patAllowNeverExpire: false,
    });
    expect(result).toBe("never_expire_not_allowed");
  });

  it("rejects expiry beyond max validity", () => {
    const tooFar = new Date(Date.now() + 120 * 24 * 60 * 60 * 1000).toISOString();
    const result = validatePatExpiry(tooFar, policy);
    expect(result).toBe("expiry_exceeds_max");
  });

  it("accepts expiry within max validity", () => {
    const within = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const result = validatePatExpiry(within, policy);
    expect(result).toBeNull();
  });

  it("checks repository role against PAT scopes", () => {
    expect(repositoryMeetsPatRequirements("guest", true, false)).toBe(true);
    expect(repositoryMeetsPatRequirements("guest", false, true)).toBe(false);
    expect(repositoryMeetsPatRequirements("developer", false, true)).toBe(true);
  });
});

describe("computeRotatedPatExpiry", () => {
  const policy = {
    patMaxValidityDays: 90,
    patAllowNeverExpire: true,
  };

  it("keeps expiry when resetExpiry is false", () => {
    const createdAt = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const result = computeRotatedPatExpiry(createdAt, expiresAt, false, policy);
    expect(result).toEqual({ ok: true, expiresAt });
  });

  it("rejects expired tokens when resetExpiry is false", () => {
    const createdAt = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000);
    const expiresAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const result = computeRotatedPatExpiry(createdAt, expiresAt, false, policy);
    expect(result).toEqual({ ok: false, error: "token_expired" });
  });

  it("preserves original ttl when resetExpiry is true", () => {
    const createdAt = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const before = Date.now();
    const result = computeRotatedPatExpiry(createdAt, expiresAt, true, policy);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const ttlMs = expiresAt.getTime() - createdAt.getTime();
      const expectedMin = before + ttlMs;
      const expectedMax = Date.now() + ttlMs;
      expect(result.expiresAt?.getTime()).toBeGreaterThanOrEqual(expectedMin - 1000);
      expect(result.expiresAt?.getTime()).toBeLessThanOrEqual(expectedMax + 1000);
    }
  });

  it("keeps never-expiring tokens when resetExpiry is true", () => {
    const createdAt = new Date("2026-01-01T00:00:00.000Z");
    const result = computeRotatedPatExpiry(createdAt, null, true, policy);
    expect(result).toEqual({ ok: true, expiresAt: null });
  });

  it("rejects ttl that exceeds policy max validity", () => {
    const createdAt = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000);
    const expiresAt = new Date(Date.now() + 120 * 24 * 60 * 60 * 1000);
    const result = computeRotatedPatExpiry(createdAt, expiresAt, true, {
      ...policy,
      patMaxValidityDays: 30,
    });
    expect(result).toEqual({ ok: false, error: "expiry_exceeds_max" });
  });
});
