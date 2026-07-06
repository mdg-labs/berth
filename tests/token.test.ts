// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { resetSigningKeyCache } from "@/lib/token/keys";
import { issueRegistryToken } from "@/lib/token/issue";
import {
  extractProjectNames,
  parseScopeEntry,
  parseScopeParam,
  parseScopes,
} from "@/lib/token/scope";

const DEV_KEY_PATH = path.join(
  process.cwd(),
  "docker/token/dev-signing-key.pem",
);
const DEV_CERT_PATH = path.join(
  process.cwd(),
  "docker/registry/certs/rootcert.pem",
);

function useDevSigningMaterial(): void {
  process.env.TOKEN_SIGNING_KEY_PATH = DEV_KEY_PATH;
  process.env.TOKEN_CERT_PATH = DEV_CERT_PATH;
}

describe("token scope parsing", () => {
  it("parses a single repository scope", () => {
    expect(parseScopeEntry("repository:test/repo:pull")).toEqual({
      type: "repository",
      name: "test/repo",
      actions: ["pull"],
    });
  });

  it("parses multiple actions in one scope", () => {
    expect(parseScopeEntry("repository:proj/app:pull,push")).toEqual({
      type: "repository",
      name: "proj/app",
      actions: ["pull", "push"],
    });
  });

  it("parses space-separated scope params", () => {
    const scopes = parseScopeParam(
      "repository:a/x:pull repository:b/y:push,delete",
    );
    expect(scopes).toEqual([
      "repository:a/x:pull",
      "repository:b/y:push,delete",
    ]);

    const access = parseScopes(
      "repository:a/x:pull repository:b/y:push",
    );
    expect(access).toHaveLength(2);
    expect(access[0]?.actions).toEqual(["pull"]);
    expect(access[1]?.actions).toEqual(["push"]);
  });

  it("extracts project names from repository scopes", () => {
    expect(
      extractProjectNames([
        { type: "repository", name: "test/repo", actions: ["pull"] },
        { type: "registry", name: "catalog", actions: ["*"] },
      ]),
    ).toEqual(["test"]);
  });
});

describe("registry JWT issuance", () => {
  afterEach(() => {
    resetSigningKeyCache();
    delete process.env.TOKEN_SIGNING_KEY;
    delete process.env.TOKEN_CERT;
    delete process.env.TOKEN_SIGNING_KEY_PATH;
    delete process.env.TOKEN_CERT_PATH;
    delete process.env.TOKEN_TTL_SECONDS;
    delete process.env.TOKEN_ISSUER;
  });

  it("issues RS256 JWT with x5c header and expected claims", async () => {
    useDevSigningMaterial();
    process.env.TOKEN_TTL_SECONDS = "120";
    process.env.TOKEN_ISSUER = "registry";

    const issued = await issueRegistryToken("user@example.com", "registry", [
      { type: "repository", name: "test/repo", actions: ["pull"] },
    ]);

    expect(issued.expiresIn).toBe(120);
    expect(issued.token.split(".")).toHaveLength(3);

    const { decodeProtectedHeader, decodeJwt } = await import("jose");
    const header = decodeProtectedHeader(issued.token);
    expect(header.alg).toBe("RS256");
    expect(header.x5c).toBeDefined();
    expect(header.x5c?.length).toBeGreaterThan(0);

    const claims = decodeJwt(issued.token);
    expect(claims.iss).toBe("registry");
    expect(claims.sub).toBe("user@example.com");
    expect(claims.aud).toBe("registry");
    expect(claims.access).toEqual([
      { type: "repository", name: "test/repo", actions: ["pull"] },
    ]);
    expect(claims.exp).toBeGreaterThan(claims.iat as number);
    expect(claims.exp).toBe((claims.iat as number) + 120);
  });

  it("loads inline PEM signing material", async () => {
    useDevSigningMaterial();
    process.env.TOKEN_SIGNING_KEY = readFileSync(DEV_KEY_PATH, "utf8");
    process.env.TOKEN_CERT = readFileSync(DEV_CERT_PATH, "utf8");
    delete process.env.TOKEN_SIGNING_KEY_PATH;
    delete process.env.TOKEN_CERT_PATH;

    const issued = await issueRegistryToken("admin@localhost", "registry", []);
    expect(issued.token.length).toBeGreaterThan(20);
  });
});
