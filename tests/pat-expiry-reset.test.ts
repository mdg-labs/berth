// Copyright (c) 2026 Michael David Guggenbichler (MDG Labs), licensed under Apache-2.0 — see LICENSE

import { describe, expect, it } from "vitest";

import {
  previewResetExpiry,
  resetExpiryLifetimeMs,
} from "@/lib/pat/expiry-reset";
import { computeRotatedPatExpiry } from "@/lib/pat/validation";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-06-01T00:00:00.000Z");

describe("reset expiry preview", () => {
  it("previews now plus the stored lifetime, not the time already used", () => {
    // Created 50 days ago with a 30-day lifetime, last reset 25 days ago:
    // expiresAt - createdAt is 55 days, the chosen lifetime is 30.
    const token = {
      createdAt: new Date(NOW - 50 * DAY_MS).toISOString(),
      expiresAt: new Date(NOW + 5 * DAY_MS).toISOString(),
      expiryLifetimeSeconds: 30 * 86400,
    };
    expect(previewResetExpiry(token, NOW)?.getTime()).toBe(NOW + 30 * DAY_MS);
  });

  it("falls back to expiresAt - createdAt when no lifetime is stored", () => {
    const token = {
      createdAt: new Date(NOW - 10 * DAY_MS).toISOString(),
      expiresAt: new Date(NOW + 20 * DAY_MS).toISOString(),
      expiryLifetimeSeconds: null,
    };
    expect(previewResetExpiry(token, NOW)?.getTime()).toBe(NOW + 30 * DAY_MS);
  });

  it("previews nothing for a token that never expires", () => {
    const token = {
      createdAt: new Date(NOW - DAY_MS).toISOString(),
      expiresAt: null,
      expiryLifetimeSeconds: null,
    };
    expect(resetExpiryLifetimeMs(token)).toBeNull();
    expect(previewResetExpiry(token, NOW)).toBeNull();
  });

  it("agrees with the expiry the server applies", () => {
    const row = {
      createdAt: new Date(Date.now() - 50 * DAY_MS),
      expiresAt: new Date(Date.now() + 5 * DAY_MS),
      expiryLifetimeSeconds: 30 * 86400,
    };
    const applied = computeRotatedPatExpiry(row, true, {
      patMaxValidityDays: 90,
      patAllowNeverExpire: true,
    });
    const before = Date.now();
    const preview = previewResetExpiry(row, before);
    expect(applied.ok).toBe(true);
    if (applied.ok) {
      expect(
        Math.abs(applied.expiresAt!.getTime() - preview!.getTime()),
      ).toBeLessThan(1000);
    }
  });
});
