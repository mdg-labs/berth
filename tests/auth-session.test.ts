// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { afterEach, describe, expect, it } from "vitest";

import {
  buildClearSessionCookie,
  buildSessionCookie,
  getSessionIdFromCookie,
} from "@/lib/session/cookie";
import { cookieSecure } from "@/lib/session/config";

describe("session cookies", () => {
  afterEach(() => {
    delete process.env.APP_URL;
    delete process.env.SESSION_TTL_SECONDS;
  });

  it("extracts session id from cookie header", () => {
    const cookie = buildSessionCookie("session-123");
    const sessionId = getSessionIdFromCookie(cookie);
    expect(sessionId).toBe("session-123");
  });

  it("omits Secure on http APP_URL", () => {
    process.env.APP_URL = "http://localhost:8080";
    expect(cookieSecure()).toBe(false);
    expect(buildSessionCookie("abc")).not.toContain("Secure");
    expect(buildClearSessionCookie()).not.toContain("Secure");
  });

  it("includes Secure on https APP_URL", () => {
    process.env.APP_URL = "https://registry.example.com";
    expect(cookieSecure()).toBe(true);
    expect(buildSessionCookie("abc")).toContain("Secure");
  });
});
