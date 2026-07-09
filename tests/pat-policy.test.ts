// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { describe, expect, it } from "vitest";

import {
  validatePatCreateInput,
  validatePatExpiry,
} from "@/lib/pat/validation";

describe("admin PAT policy validation", () => {
  it("requires max validity when never-expire is disabled", () => {
    const policy = {
      patMaxValidityDays: null,
      patAllowNeverExpire: false,
    };

    expect(validatePatExpiry(null, policy)).toBe("never_expire_not_allowed");
    expect(
      validatePatCreateInput(
        {
          name: "CI",
          allowPull: true,
          allowPush: false,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          repositoryIds: null,
        },
        { ...policy, patMaxValidityDays: 30 },
      ),
    ).toBeNull();
  });
});
