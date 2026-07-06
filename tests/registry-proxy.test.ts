// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { describe, expect, it, vi } from "vitest";

import {
  rewriteRegistryLocation,
  rewriteResponseHeaderValue,
} from "@/lib/registry/proxy/rewrite";
import { extractBearerToken } from "@/lib/token/verify";

describe("registry proxy rewrite", () => {
  it("rewrites internal registry Location to public origin", () => {
    expect(
      rewriteRegistryLocation(
        "http://registry:5000/v2/my-project/hello/blobs/uploads/abc",
        "http://localhost:8080",
      ),
    ).toBe("http://localhost:8080/v2/my-project/hello/blobs/uploads/abc");
  });

  it("leaves relative Location unchanged", () => {
    expect(
      rewriteRegistryLocation(
        "/v2/my-project/hello/blobs/uploads/abc",
        "http://localhost:8080",
      ),
    ).toBe("/v2/my-project/hello/blobs/uploads/abc");
  });

  it("rewrites only Location response headers", () => {
    expect(
      rewriteResponseHeaderValue(
        "Location",
        "http://registry:5000/v2/demo/repo/blobs/uploads/1",
        "https://registry.example.com",
      ),
    ).toBe("https://registry.example.com/v2/demo/repo/blobs/uploads/1");

    expect(
      rewriteResponseHeaderValue(
        "Content-Length",
        "12345",
        "https://registry.example.com",
      ),
    ).toBe("12345");
  });
});

describe("extractBearerToken", () => {
  it("parses bearer authorization header", () => {
    expect(extractBearerToken("Bearer abc.def.ghi")).toBe("abc.def.ghi");
    expect(extractBearerToken("basic abc")).toBeNull();
    expect(extractBearerToken(null)).toBeNull();
  });
});

describe("verifyRegistryBearerToken", () => {
  it("accepts tokens issued by the app", async () => {
    vi.stubEnv("TOKEN_SIGNING_KEY_PATH", "docker/token/dev-signing-key.pem");
    vi.stubEnv("TOKEN_CERT_PATH", "docker/registry/certs/rootcert.pem");
    vi.stubEnv("TOKEN_ISSUER", "registry");
    vi.stubEnv("REGISTRY_AUTH_TOKEN_SERVICE", "registry");

    const { issueRegistryToken } = await import("@/lib/token/issue");
    const { verifyRegistryBearerToken } = await import("@/lib/token/verify");
    const { resetSigningKeyCache } = await import("@/lib/token/keys");

    resetSigningKeyCache();

    const issued = await issueRegistryToken("test@example.com", "registry", [
      {
        type: "repository",
        name: "demo/repo",
        actions: ["pull", "push"],
      },
    ]);

    const verified = await verifyRegistryBearerToken(issued.token);
    expect(verified.ok).toBe(true);
    if (verified.ok) {
      expect(verified.subject).toBe("test@example.com");
    }
  });
});
