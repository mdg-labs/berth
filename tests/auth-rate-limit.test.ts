// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { afterEach, describe, expect, it } from "vitest";

import {
  checkLoginRateLimit,
  consumeRateLimit,
  resetRateLimits,
} from "@/lib/rate-limit/login";

describe("login rate limiter", () => {
  afterEach(() => {
    resetRateLimits();
    delete process.env.RATE_LIMIT_LOGIN_MAX_ATTEMPTS;
    delete process.env.RATE_LIMIT_WINDOW_SECONDS;
  });

  it("allows requests under the configured threshold", () => {
    process.env.RATE_LIMIT_LOGIN_MAX_ATTEMPTS = "3";
    process.env.RATE_LIMIT_WINDOW_SECONDS = "60";

    expect(consumeRateLimit("test-key")).toBe(true);
    expect(consumeRateLimit("test-key")).toBe(true);
    expect(consumeRateLimit("test-key")).toBe(true);
    expect(consumeRateLimit("test-key")).toBe(false);
  });

  it("checks both ip and email buckets", () => {
    process.env.RATE_LIMIT_LOGIN_MAX_ATTEMPTS = "2";

    expect(checkLoginRateLimit("1.2.3.4", "user@example.com")).toBe(true);
    expect(checkLoginRateLimit("1.2.3.4", "user@example.com")).toBe(true);
    expect(checkLoginRateLimit("1.2.3.4", "user@example.com")).toBe(false);

    expect(checkLoginRateLimit("5.6.7.8", "other@example.com")).toBe(true);
    expect(checkLoginRateLimit("5.6.7.8", "other@example.com")).toBe(true);
    expect(checkLoginRateLimit("5.6.7.8", "other@example.com")).toBe(false);
  });
});
