// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { afterEach, describe, expect, it } from "vitest";

import {
  computePurgesAt,
  getUserDeleteGracePeriodDays,
  isPastPurgeDeadline,
  isPendingDeletion,
} from "@/lib/users/config";
import {
  formatDeletionCountdown,
  getUserDeletionState,
} from "@/lib/users/presentation";

describe("user delete grace configuration", () => {
  afterEach(() => {
    delete process.env.USER_DELETE_GRACE_PERIOD_DAYS;
  });

  it("defaults to 30 days when unset", () => {
    expect(getUserDeleteGracePeriodDays()).toBe(30);
  });

  it("reads configured grace period days", () => {
    process.env.USER_DELETE_GRACE_PERIOD_DAYS = "7";
    expect(getUserDeleteGracePeriodDays()).toBe(7);
  });

  it("treats zero grace as immediate purge deadline", () => {
    process.env.USER_DELETE_GRACE_PERIOD_DAYS = "0";
    const deletedAt = new Date("2026-01-01T00:00:00.000Z");
    expect(computePurgesAt(deletedAt)).toEqual(deletedAt);
    expect(isPendingDeletion(deletedAt)).toBe(false);
    expect(isPastPurgeDeadline(deletedAt)).toBe(true);
  });
});

describe("user deletion presentation", () => {
  it("maps active users", () => {
    expect(getUserDeletionState(null)).toEqual({
      status: "active",
      deletedAt: null,
      purgesAt: null,
      pendingDeletion: false,
    });
  });

  it("formats deletion countdown labels", () => {
    const future = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatDeletionCountdown(future)).toMatch(/^Deletes in \d+ days$/);
    expect(formatDeletionCountdown(null)).toBe("Pending deletion");
  });
});
