// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  buildClearMfaPendingCookie,
  buildMfaPendingCookie,
  createMfaPendingState,
  decodeMfaPendingState,
  encodeMfaPendingState,
  getMfaPendingStateFromCookie,
  hasMfaPendingCookie,
} from "@/lib/mfa/pending";

describe("mfa pending cookie", () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = "test-session-secret";
    process.env.APP_URL = "http://localhost:8080";
  });

  afterEach(() => {
    delete process.env.SESSION_SECRET;
    delete process.env.APP_URL;
  });

  it("round-trips signed pending state", () => {
    const state = createMfaPendingState("user-123");
    const encoded = encodeMfaPendingState(state);
    const decoded = decodeMfaPendingState(encoded);

    expect(decoded).toEqual(state);
  });

  it("rejects tampered payloads", () => {
    const encoded = encodeMfaPendingState(createMfaPendingState("user-123"));
    expect(decodeMfaPendingState(`${encoded}x`)).toBeNull();
  });

  it("rejects expired pending state", () => {
    const encoded = encodeMfaPendingState({
      userId: "user-123",
      exp: Date.now() - 1000,
    });
    expect(decodeMfaPendingState(encoded)).toBeNull();
  });

  it("reads pending state from cookie header", () => {
    const encoded = encodeMfaPendingState(createMfaPendingState("user-123"));
    const cookie = buildMfaPendingCookie(encoded);
    const header = `other=value; ${cookie.split(";")[0]}`;

    expect(hasMfaPendingCookie(header)).toBe(true);
    expect(getMfaPendingStateFromCookie(header)?.userId).toBe("user-123");
  });

  it("builds clear cookie with zero max-age", () => {
    expect(buildClearMfaPendingCookie()).toContain("Max-Age=0");
  });
});
