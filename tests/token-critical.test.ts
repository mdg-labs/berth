// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { afterEach, describe, expect, it } from "vitest";

import {
  filterScopeActionsForPublicPull,
  filterScopeActionsForRole,
} from "@/lib/rbac/check";
import { resetSigningKeyCache } from "@/lib/token/keys";
import { issueRegistryToken } from "@/lib/token/issue";

const DEV_KEY_PATH = "docker/token/dev-signing-key.pem";
const DEV_CERT_PATH = "docker/registry/certs/rootcert.pem";

describe("token scope intersection (critical paths)", () => {
  it("never expands requested scopes beyond role allowance", () => {
    const requested = ["pull", "push", "delete"] as const;
    expect(filterScopeActionsForRole([...requested], "developer")).toEqual([
      "pull",
      "push",
    ]);
    expect(filterScopeActionsForRole([...requested], "guest")).toEqual(["pull"]);
    expect(filterScopeActionsForRole([...requested], "maintainer")).toEqual([
      "pull",
      "push",
      "delete",
    ]);
  });

  it("public pull filter strips push from anonymous requests", () => {
    expect(filterScopeActionsForPublicPull(["pull", "push"])).toEqual(["pull"]);
    expect(filterScopeActionsForPublicPull(["delete"])).toEqual([]);
  });
});

describe("JWT claim shape (critical paths)", () => {
  afterEach(() => {
    resetSigningKeyCache();
    delete process.env.TOKEN_SIGNING_KEY_PATH;
    delete process.env.TOKEN_CERT_PATH;
    delete process.env.TOKEN_TTL_SECONDS;
    delete process.env.TOKEN_ISSUER;
  });

  it("uses anonymous subject for unauthenticated public pull tokens", async () => {
    process.env.TOKEN_SIGNING_KEY_PATH = DEV_KEY_PATH;
    process.env.TOKEN_CERT_PATH = DEV_CERT_PATH;
    process.env.TOKEN_ISSUER = "registry";

    const issued = await issueRegistryToken("anonymous", "registry", [
      { type: "repository", name: "public/app", actions: ["pull"] },
    ]);

    const { decodeJwt } = await import("jose");
    const claims = decodeJwt(issued.token);
    expect(claims.sub).toBe("anonymous");
    expect(claims.access).toEqual([
      { type: "repository", name: "public/app", actions: ["pull"] },
    ]);
  });

  it("includes service audience matching Distribution token spec", async () => {
    process.env.TOKEN_SIGNING_KEY_PATH = DEV_KEY_PATH;
    process.env.TOKEN_CERT_PATH = DEV_CERT_PATH;
    process.env.TOKEN_ISSUER = "registry";

    const issued = await issueRegistryToken("user@example.com", "registry", []);
    const { decodeJwt } = await import("jose");
    const claims = decodeJwt(issued.token);
    expect(claims.aud).toBe("registry");
    expect(claims.iss).toBe("registry");
    expect(claims.sub).toBe("user@example.com");
    expect(Array.isArray(claims.access)).toBe(true);
  });
});
