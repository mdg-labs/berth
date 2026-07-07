// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { afterEach, describe, expect, it } from "vitest";

import {
  getEmailFromAddress,
  getPasswordResetTtlHours,
  getUserInviteTtlHours,
  isEmailConfigured,
} from "@/lib/email/config";

describe("email config", () => {
  afterEach(() => {
    delete process.env.SMTP_HOST;
    delete process.env.EMAIL_FROM;
    delete process.env.PASSWORD_RESET_TTL_HOURS;
    delete process.env.USER_INVITE_TTL_HOURS;
  });

  it("reports unconfigured when SMTP_HOST is missing", () => {
    expect(isEmailConfigured()).toBe(false);
  });

  it("reports configured when SMTP_HOST is set", () => {
    process.env.SMTP_HOST = "smtp.example.com";
    expect(isEmailConfigured()).toBe(true);
  });

  it("uses defaults for from address and TTL values", () => {
    expect(getEmailFromAddress()).toBe("noreply@localhost");
    expect(getPasswordResetTtlHours()).toBe(1);
    expect(getUserInviteTtlHours()).toBe(72);
  });

  it("reads custom env values", () => {
    process.env.EMAIL_FROM = "ops@example.com";
    process.env.PASSWORD_RESET_TTL_HOURS = "2";
    process.env.USER_INVITE_TTL_HOURS = "48";

    expect(getEmailFromAddress()).toBe("ops@example.com");
    expect(getPasswordResetTtlHours()).toBe(2);
    expect(getUserInviteTtlHours()).toBe(48);
  });
});
