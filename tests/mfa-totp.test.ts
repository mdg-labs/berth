// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateSync } from "otplib";

import { encryptTotpSecret, decryptTotpSecret } from "@/lib/mfa/crypto";

describe("mfa crypto", () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = "test-session-secret";
  });

  afterEach(() => {
    delete process.env.SESSION_SECRET;
  });

  it("encrypts and decrypts TOTP secrets", () => {
    const secret = "JBSWY3DPEHPK3PXP";
    const encrypted = encryptTotpSecret(secret);
    expect(encrypted).not.toContain(secret);
    expect(decryptTotpSecret(encrypted)).toBe(secret);
  });
});

describe("mfa totp", () => {
  beforeEach(() => {
    process.env.APP_URL = "http://localhost:8080";
  });

  afterEach(() => {
    delete process.env.APP_URL;
  });

  it("builds otpauth URIs and verifies generated codes", async () => {
    const { createTotpSecret, buildOtpAuthUri, verifyTotpCode } = await import(
      "@/lib/mfa/totp"
    );

    const secret = createTotpSecret();
    const uri = buildOtpAuthUri({
      secret,
      accountName: "user@example.com",
    });

    expect(uri).toContain("otpauth://totp/");
    expect(uri).toContain("user%40example.com");

    const token = generateSync({ secret });
    expect(await verifyTotpCode(secret, token)).toBe(true);
    expect(await verifyTotpCode(secret, "000000")).toBe(false);
  });

  it("generates backup codes in XXXX-XXXX format", async () => {
    const { generateBackupCodes } = await import("@/lib/mfa/totp");
    const codes = generateBackupCodes(3);
    expect(codes).toHaveLength(3);
    for (const code of codes) {
      expect(code).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}$/);
    }
  });
});
