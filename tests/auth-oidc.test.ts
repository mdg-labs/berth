// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { afterEach, describe, expect, it } from "vitest";

import {
  decodeOidcFlowState,
  encodeOidcFlowState,
} from "@/lib/oidc/state";
import { isOidcConfigured } from "@/lib/oidc/config";

describe("oidc helpers", () => {
  afterEach(() => {
    delete process.env.OIDC_ISSUER;
    delete process.env.OIDC_CLIENT_ID;
    delete process.env.OIDC_CLIENT_SECRET;
    delete process.env.SESSION_SECRET;
  });

  it("detects configured OIDC env", () => {
    expect(isOidcConfigured()).toBe(false);

    process.env.OIDC_ISSUER = "https://idp.example.com";
    process.env.OIDC_CLIENT_ID = "client";
    process.env.OIDC_CLIENT_SECRET = "secret";

    expect(isOidcConfigured()).toBe(true);
  });

  it("round-trips signed OIDC flow state", () => {
    process.env.SESSION_SECRET = "test-secret";

    const encoded = encodeOidcFlowState({
      state: "state-1",
      codeVerifier: "verifier-1",
      nonce: "nonce-1",
    });

    expect(decodeOidcFlowState(encoded)).toEqual({
      state: "state-1",
      codeVerifier: "verifier-1",
      nonce: "nonce-1",
    });
    expect(decodeOidcFlowState("tampered.payload")).toBeNull();
  });
});
