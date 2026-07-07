// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { describe, expect, it } from "vitest";

import {
  buildLoginUrl,
  buildPasswordResetUrl,
  buildUserInviteUrl,
  passwordResetEmail,
  repositoryInviteEmail,
  userInviteEmail,
} from "@/lib/email/templates";

describe("email templates", () => {
  it("builds password reset email", () => {
    const message = passwordResetEmail({
      to: "user@example.com",
      resetUrl: "https://registry.example.com/reset-password?token=abc",
    });

    expect(message.subject).toContain("Reset your Berth password");
    expect(message.text).toContain("reset-password?token=abc");
    expect(message.html).toContain("reset-password?token=abc");
  });

  it("builds user invite email", () => {
    const message = userInviteEmail({
      to: "new@example.com",
      inviteeName: "New User",
      inviteUrl: "https://registry.example.com/accept-invite?token=xyz",
    });

    expect(message.subject).toContain("invited");
    expect(message.text).toContain("New User");
    expect(message.html).toContain("accept-invite?token=xyz");
  });

  it("builds repository invite email", () => {
    const message = repositoryInviteEmail({
      to: "dev@example.com",
      repositoryName: "demo",
      role: "developer",
      inviterName: "Admin",
      loginUrl: "https://registry.example.com/login",
    });

    expect(message.subject).toContain("demo");
    expect(message.text).toContain("developer");
    expect(message.html).toContain("/login");
  });

  it("builds app URLs from APP_URL", () => {
    process.env.APP_URL = "https://registry.example.com";
    expect(buildPasswordResetUrl("token")).toBe(
      "https://registry.example.com/reset-password?token=token",
    );
    expect(buildUserInviteUrl("token")).toBe(
      "https://registry.example.com/accept-invite?token=token",
    );
    expect(buildLoginUrl()).toBe("https://registry.example.com/login");
    delete process.env.APP_URL;
  });
});
