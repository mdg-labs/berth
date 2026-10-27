// Copyright (c) 2026 Michael David Guggenbichler (MDG Labs), licensed under Apache-2.0 — see LICENSE

import { describe, expect, it } from "vitest";

import {
  latestPatExpiryDate,
  resolvePatExpiry,
} from "@/components/account/pat-expiry";
import { validatePatExpiry } from "@/lib/pat/validation";
import type { PatPolicy } from "@/lib/pat/config";

const DAY_MS = 24 * 60 * 60 * 1000;
const policy = (days: number | null): PatPolicy => ({
  patAllowNeverExpire: true,
  patMaxValidityDays: days,
});

describe("PAT expiry picker", () => {
  it.each([
    "2026-10-27T00:00:00.000Z",
    "2026-10-27T12:34:56.789Z",
    "2026-10-27T23:59:59.000Z",
  ])("accepts the latest offered date when submitted at %s", (iso) => {
    const now = new Date(iso).getTime();
    const maxDays = 30;
    const date = latestPatExpiryDate(now, maxDays);
    const expiresAt = resolvePatExpiry(date, now, maxDays);

    expect(new Date(expiresAt).getTime()).toBeLessThanOrEqual(
      now + maxDays * DAY_MS,
    );
    expect(expiresAt.slice(0, 10)).toBe(date);

    const realNow = Date.now;
    Date.now = () => now;
    try {
      expect(validatePatExpiry(expiresAt, policy(maxDays))).toBeNull();
    } finally {
      Date.now = realNow;
    }
  });

  it("keeps end of day for dates before the ceiling", () => {
    const now = new Date("2026-10-27T12:00:00.000Z").getTime();
    expect(resolvePatExpiry("2026-11-05", now, 30)).toBe(
      "2026-11-05T23:59:59.999Z",
    );
  });

  it("keeps end of day when no maximum is set", () => {
    const now = new Date("2026-10-27T12:00:00.000Z").getTime();
    expect(resolvePatExpiry("2027-10-27", now, null)).toBe(
      "2027-10-27T23:59:59.999Z",
    );
  });
});
