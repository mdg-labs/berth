// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { afterEach, describe, expect, it, vi } from "vitest";

const { buildAuthorizationUrlMock } = vi.hoisted(() => ({
  buildAuthorizationUrlMock: vi.fn(),
}));

vi.mock("@/lib/oidc/client", () => ({
  getOidcConfiguration: vi.fn(async () => ({})),
  oidcClient: {
    randomPKCECodeVerifier: () => "verifier",
    calculatePKCECodeChallenge: vi.fn(async () => "challenge"),
    randomState: () => "state-value",
    randomNonce: () => "nonce-value",
    buildAuthorizationUrl: buildAuthorizationUrlMock,
  },
}));

import { GET as oidcStart } from "@/app/api/auth/oidc/start/route";

describe("oidc start route (mocked IdP)", () => {
  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.OIDC_ISSUER;
    delete process.env.OIDC_CLIENT_ID;
    delete process.env.OIDC_CLIENT_SECRET;
    delete process.env.SESSION_SECRET;
    delete process.env.APP_URL;
  });

  it("redirects to authorization URL when configured", async () => {
    process.env.OIDC_ISSUER = "https://idp.example.com";
    process.env.OIDC_CLIENT_ID = "client-id";
    process.env.OIDC_CLIENT_SECRET = "client-secret";
    process.env.SESSION_SECRET = "secret";
    process.env.APP_URL = "http://localhost:8080";

    buildAuthorizationUrlMock.mockReturnValue(
      new URL("https://idp.example.com/authorize?state=state-value"),
    );

    const response = await oidcStart();
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("idp.example.com");
    expect(response.headers.get("set-cookie")).toContain("berth_oidc_state=");
  });

  it("returns 404 when OIDC is not configured", async () => {
    const response = await oidcStart();
    expect(response.status).toBe(404);
  });
});
