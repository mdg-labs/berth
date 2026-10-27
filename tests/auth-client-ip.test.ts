// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/auth/login/route";
import { getClientIp } from "@/lib/auth/credentials";
import { resetRateLimits } from "@/lib/rate-limit/login";

const { findUserByEmailMock } = vi.hoisted(() => ({
  findUserByEmailMock: vi.fn(),
}));

vi.mock("@/lib/auth/credentials", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/credentials")>()),
  findUserByEmail: findUserByEmailMock,
}));

function requestWith(headers: Record<string, string>) {
  return new Request("http://localhost/api/auth/login", { headers });
}

describe("getClientIp", () => {
  afterEach(() => {
    delete process.env.TRUSTED_PROXY_HOPS;
    delete process.env.TRUSTED_PROXY_HEADER;
  });

  it("returns unknown when no forwarded header is present", () => {
    expect(getClientIp(requestWith({}))).toBe("unknown");
  });

  it("uses the only entry written by the single trusted proxy", () => {
    expect(getClientIp(requestWith({ "x-forwarded-for": "198.51.100.7" }))).toBe(
      "198.51.100.7",
    );
  });

  it("ignores a client-supplied prefix behind one trusted proxy", () => {
    expect(
      getClientIp(
        requestWith({ "x-forwarded-for": "10.9.9.9, 192.0.2.1, 198.51.100.7" }),
      ),
    ).toBe("198.51.100.7");
  });

  it("skips as many entries from the right as there are trusted proxies", () => {
    process.env.TRUSTED_PROXY_HOPS = "2";
    expect(
      getClientIp(
        requestWith({ "x-forwarded-for": "10.9.9.9, 198.51.100.7, 172.16.0.5" }),
      ),
    ).toBe("198.51.100.7");
  });

  it("falls back to the leftmost entry when the chain is shorter than the hop count", () => {
    process.env.TRUSTED_PROXY_HOPS = "3";
    expect(
      getClientIp(requestWith({ "x-forwarded-for": "198.51.100.7, 172.16.0.5" })),
    ).toBe("198.51.100.7");
  });

  it("trusts no forwarded headers when the hop count is 0", () => {
    process.env.TRUSTED_PROXY_HOPS = "0";
    expect(
      getClientIp(
        requestWith({
          "x-forwarded-for": "198.51.100.7",
          "x-real-ip": "198.51.100.8",
        }),
      ),
    ).toBe("unknown");
  });

  it("falls back to the default hop count for an invalid value", () => {
    process.env.TRUSTED_PROXY_HOPS = "abc";
    expect(
      getClientIp(requestWith({ "x-forwarded-for": "10.9.9.9, 198.51.100.7" })),
    ).toBe("198.51.100.7");
  });

  it("ignores X-Real-IP unless it is the configured header", () => {
    expect(getClientIp(requestWith({ "x-real-ip": "198.51.100.8" }))).toBe(
      "unknown",
    );

    process.env.TRUSTED_PROXY_HEADER = "x-real-ip";
    expect(
      getClientIp(
        requestWith({
          "x-forwarded-for": "10.9.9.9",
          "x-real-ip": "198.51.100.8",
        }),
      ),
    ).toBe("198.51.100.8");
  });
});

describe("POST /api/auth/login per-IP rate limiting", () => {
  beforeEach(() => {
    resetRateLimits();
    findUserByEmailMock.mockResolvedValue(null);
    process.env.RATE_LIMIT_LOGIN_MAX_ATTEMPTS = "2";
  });

  afterEach(() => {
    resetRateLimits();
    delete process.env.RATE_LIMIT_LOGIN_MAX_ATTEMPTS;
  });

  function login(forwardedFor: string, email: string) {
    return POST(
      new NextRequest("http://localhost/api/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": forwardedFor,
        },
        body: JSON.stringify({ email, password: "wrong" }),
      }),
    );
  }

  it("keeps counting one client when it rotates a spoofed leading entry", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      const response = await login(
        `10.0.0.${i}, 198.51.100.7`,
        `user${i}@example.com`,
      );
      statuses.push(response.status);
    }

    expect(statuses).toEqual([401, 401, 429]);
  });
});
