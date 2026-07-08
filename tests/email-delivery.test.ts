// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { describe, expect, it } from "vitest";

import { toEmailDeliveryStatus } from "@/lib/email/send";

describe("toEmailDeliveryStatus", () => {
  it("maps sent results", () => {
    expect(toEmailDeliveryStatus({ sent: true })).toBe("sent");
  });

  it("maps not configured results", () => {
    expect(
      toEmailDeliveryStatus({ sent: false, reason: "not_configured" }),
    ).toBe("not_configured");
  });

  it("maps failed results", () => {
    expect(toEmailDeliveryStatus({ sent: false, reason: "failed" })).toBe(
      "failed",
    );
  });
});
