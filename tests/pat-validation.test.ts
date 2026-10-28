// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { describe, expect, it } from "vitest";

import {
  computeRotatedPatExpiry,
  expiryLifetimeSeconds,
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
  const DAY_MS = 24 * 60 * 60 * 1000;

  function credential(
    createdDaysAgo: number,
    expiresInDays: number | null,
    lifetimeDays: number | null,
  ) {
    return {
      createdAt: new Date(Date.now() - createdDaysAgo * DAY_MS),
      expiresAt:
        expiresInDays === null ? null : new Date(Date.now() + expiresInDays * DAY_MS),
      expiryLifetimeSeconds: lifetimeDays === null ? null : lifetimeDays * 86400,
    };
  }

  it("keeps expiry when resetExpiry is false", () => {
    const row = credential(30, 30, 60);
    const result = computeRotatedPatExpiry(row, false, policy);
    expect(result).toEqual({ ok: true, expiresAt: row.expiresAt });
  });

  it("rejects expired tokens when resetExpiry is false", () => {
    const result = computeRotatedPatExpiry(credential(120, -1, 119), false, policy);
    expect(result).toEqual({ ok: false, error: "token_expired" });
  });

  it("resets to now plus the stored lifetime", () => {
    const before = Date.now();
    const result = computeRotatedPatExpiry(credential(30, 30, 60), true, policy);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.expiresAt?.getTime()).toBeGreaterThanOrEqual(before + 60 * DAY_MS);
      expect(result.expiresAt?.getTime()).toBeLessThanOrEqual(Date.now() + 60 * DAY_MS);
    }
  });

  it("ignores the age of the row when the lifetime is stored", () => {
    const result = computeRotatedPatExpiry(credential(25, 5, 30), true, {
      ...policy,
      patMaxValidityDays: 30,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.expiresAt!.getTime()).toBeLessThanOrEqual(Date.now() + 30 * DAY_MS);
    }
  });

  it("falls back to expiresAt - createdAt when no lifetime is stored", () => {
    const before = Date.now();
    const result = computeRotatedPatExpiry(credential(30, 30, null), true, policy);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.expiresAt?.getTime()).toBeGreaterThanOrEqual(before + 60 * DAY_MS);
    }
  });

  it("keeps never-expiring tokens when resetExpiry is true", () => {
    const result = computeRotatedPatExpiry(credential(30, null, null), true, policy);
    expect(result).toEqual({ ok: true, expiresAt: null });
  });

  it("rejects never-expire on reset when the policy forbids it", () => {
    const result = computeRotatedPatExpiry(credential(30, null, null), true, {
      ...policy,
      patAllowNeverExpire: false,
    });
    expect(result).toEqual({ ok: false, error: "never_expire_not_allowed" });
  });

  it("rejects a lifetime that exceeds policy max validity", () => {
    const result = computeRotatedPatExpiry(credential(0, 120, 120), true, {
      ...policy,
      patMaxValidityDays: 30,
    });
    expect(result).toEqual({ ok: false, error: "expiry_exceeds_max" });
  });
});

describe("expiryLifetimeSeconds", () => {
  const from = new Date("2026-01-01T00:00:00.000Z");

  it("is null for a never-expiring credential", () => {
    expect(expiryLifetimeSeconds(null, from)).toBeNull();
  });

  it("rounds down to whole seconds", () => {
    expect(
      expiryLifetimeSeconds(new Date("2026-01-01T00:01:00.999Z"), from),
    ).toBe(60);
  });

  it("never goes negative", () => {
    expect(expiryLifetimeSeconds(new Date("2025-12-31T00:00:00.000Z"), from)).toBe(0);
  });
});
