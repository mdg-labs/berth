// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { describe, expect, it } from "vitest";

import { parseBasicAuth } from "@/lib/auth/basic";
import { checkTokenRateLimit } from "@/lib/rate-limit/token";
import { resetRateLimits } from "@/lib/rate-limit/login";

describe("basic auth parsing", () => {
  it("parses valid Basic credentials", () => {
    const encoded = Buffer.from("admin@localhost:secret").toString("base64");
    expect(parseBasicAuth(`Basic ${encoded}`)).toEqual({
      username: "admin@localhost",
      password: "secret",
    });
  });

  it("returns null for missing or invalid headers", () => {
    expect(parseBasicAuth(null)).toBeNull();
    expect(parseBasicAuth("Bearer token")).toBeNull();
    expect(parseBasicAuth("Basic !!!")).toBeNull();
  });
});

describe("token rate limiter", () => {
  it("limits per ip and identifier", () => {
    resetRateLimits();
    process.env.RATE_LIMIT_LOGIN_MAX_ATTEMPTS = "2";

    expect(checkTokenRateLimit("10.0.0.1", "user@example.com")).toBe(true);
    expect(checkTokenRateLimit("10.0.0.1", "user@example.com")).toBe(true);
    expect(checkTokenRateLimit("10.0.0.1", "user@example.com")).toBe(false);

    resetRateLimits();
    delete process.env.RATE_LIMIT_LOGIN_MAX_ATTEMPTS;
  });
});
