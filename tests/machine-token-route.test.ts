// Copyright (c) 2026 Michael David Guggenbichler (MDG Labs), licensed under Apache-2.0 — see LICENSE

import { decodeJwt, decodeProtectedHeader } from "jose";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/auth/token/route";
import { MACHINE_ACCOUNT_PREFIX } from "@/lib/machine-accounts/config";
import { resetRateLimits } from "@/lib/rate-limit/login";
import { checkMachineTokenRateLimit } from "@/lib/rate-limit/token";
import { issueRegistryToken } from "@/lib/token/issue";
import { getSigningCertDer, resetSigningKeyCache } from "@/lib/token/keys";
import { verifyRegistryBearerToken } from "@/lib/token/verify";

const {
  resolveMachineAccountMock,
  recordMachineAccountUsageMock,
  findUserByEmailMock,
  verifyPasswordMock,
  resolvePatMock,
  getSessionUserMock,
  findMissingRepositoriesMock,
  getRepositoryByNameMock,
  overridesMock,
} = vi.hoisted(() => ({
  resolveMachineAccountMock: vi.fn(),
  recordMachineAccountUsageMock: vi.fn(),
  findUserByEmailMock: vi.fn(),
  verifyPasswordMock: vi.fn(),
  resolvePatMock: vi.fn(),
  getSessionUserMock: vi.fn(),
  findMissingRepositoriesMock: vi.fn(),
  getRepositoryByNameMock: vi.fn(),
  overridesMock: vi.fn(),
}));

vi.mock("@/lib/machine-accounts/store", () => ({
  resolveMachineAccount: resolveMachineAccountMock,
  recordMachineAccountUsage: recordMachineAccountUsageMock,
}));

vi.mock("@/lib/auth/credentials", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/credentials")>()),
  findUserByEmail: findUserByEmailMock,
  verifyPassword: verifyPasswordMock,
}));

vi.mock("@/lib/pat/password-auth", () => ({
  isPasswordAuthAllowedForUser: vi.fn(async () => true),
}));

vi.mock("@/lib/pat/store", () => ({
  resolvePersonalAccessToken: resolvePatMock,
  touchPersonalAccessTokenLastUsed: vi.fn(),
  recordPatUsageAudit: vi.fn(),
  buildRepositoryNameToIdMap: vi.fn(async () => new Map()),
}));

vi.mock("@/lib/session/request", () => ({
  getSessionUserFromRequest: getSessionUserMock,
}));

vi.mock("@/lib/token/repositories", () => ({
  findMissingRepositories: findMissingRepositoriesMock,
  repositoryExists: vi.fn(),
}));

vi.mock("@/lib/rbac/roles", () => ({
  getRepositoryByName: getRepositoryByNameMock,
  getEffectiveRepositoryRole: vi.fn(async () => null),
  getRepositoryMemberRole: vi.fn(),
  getRepositoryById: vi.fn(),
}));

vi.mock("@/lib/repositories/settings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/repositories/settings")>()),
  getImageOverridesForRepository: overridesMock,
}));

const ACCOUNT_ID = "6f9b1c1e-4f0e-4c55-9a52-0c4d6f1f9a11";
const SECRET = `${MACHINE_ACCOUNT_PREFIX}example-secret-value`;

const account = {
  id: ACCOUNT_ID,
  name: "ci",
  ownerRepositoryId: "repo-own",
  allowPull: true,
  allowPush: true,
  repositoryIds: ["repo-own"],
  lastUsedAt: null,
};

const repositories = [
  { id: "repo-own", name: "own", isPublic: false },
  { id: "repo-other", name: "other", isPublic: false },
];

let ipCounter = 0;

function tokenRequest(options: {
  scope?: string;
  username?: string;
  password?: string;
  cookie?: boolean;
  ip?: string;
}) {
  const headers: Record<string, string> = {
    "x-forwarded-for": options.ip ?? `198.51.100.${++ipCounter}`,
  };
  if (options.password !== undefined) {
    headers.authorization = `Basic ${Buffer.from(
      `${options.username ?? "ci"}:${options.password}`,
    ).toString("base64")}`;
  }
  const query = options.scope ? `&scope=${encodeURIComponent(options.scope)}` : "";
  return new NextRequest(
    `http://localhost/api/auth/token?service=registry${query}`,
    { headers },
  );
}

describe("token endpoint with machine accounts", () => {
  beforeEach(() => {
    vi.stubEnv("TOKEN_SIGNING_KEY_PATH", "docker/token/dev-signing-key.pem");
    vi.stubEnv("TOKEN_CERT_PATH", "docker/registry/certs/rootcert.pem");
    vi.stubEnv("TOKEN_ISSUER", "registry");
    vi.stubEnv("REGISTRY_AUTH_TOKEN_SERVICE", "registry");
    vi.stubEnv("TOKEN_TTL_SECONDS", "123");
    resetSigningKeyCache();
    resetRateLimits();
    findMissingRepositoriesMock.mockResolvedValue([]);
    recordMachineAccountUsageMock.mockResolvedValue(undefined);
    overridesMock.mockResolvedValue(new Map());
    getSessionUserMock.mockResolvedValue(null);
    findUserByEmailMock.mockResolvedValue(null);
    resolvePatMock.mockResolvedValue(null);
    resolveMachineAccountMock.mockImplementation(async (secret: string) =>
      secret === SECRET ? account : null,
    );
    getRepositoryByNameMock.mockImplementation(
      async (name: string) => repositories.find((r) => r.name === name) ?? null,
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    resetSigningKeyCache();
    resetRateLimits();
  });

  it("issues a machine token with its own subject, claim, TTL and unchanged x5c", async () => {
    const response = await GET(
      tokenRequest({
        scope: "repository:own/app:pull,push,delete",
        username: "any-username-at-all",
        password: SECRET,
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.expires_in).toBe(123);

    const claims = decodeJwt(body.token);
    expect(claims.sub).toBe(`machine:${ACCOUNT_ID}`);
    expect(claims.berth_machine_account).toBe(ACCOUNT_ID);
    expect(claims.access).toEqual([
      { type: "repository", name: "own/app", actions: ["pull", "push"] },
    ]);
    expect((claims.exp ?? 0) - (claims.iat ?? 0)).toBe(123);
    expect(decodeProtectedHeader(body.token)).toMatchObject({
      alg: "RS256",
      x5c: [getSigningCertDer()],
    });
  });

  it("records usage with the granted repository names and client IP, only for issued tokens", async () => {
    overridesMock.mockResolvedValue(new Map([["shared", "allow"]]));

    const response = await GET(
      tokenRequest({
        scope: "repository:own/app:pull repository:other/shared:pull",
        password: SECRET,
        ip: "198.51.100.77",
      }),
    );
    expect(response.status).toBe(200);
    expect(recordMachineAccountUsageMock).toHaveBeenCalledTimes(1);
    expect(recordMachineAccountUsageMock).toHaveBeenCalledWith(
      account,
      ["other", "own"],
      "198.51.100.77",
    );

    recordMachineAccountUsageMock.mockClear();
    const denied = await GET(
      tokenRequest({ scope: "repository:other/app:push", password: SECRET }),
    );
    expect(denied.status).toBe(403);
    const rejected = await GET(
      tokenRequest({ password: `${MACHINE_ACCOUNT_PREFIX}unknown` }),
    );
    expect(rejected.status).toBe(401);
    expect(recordMachineAccountUsageMock).not.toHaveBeenCalled();
  });

  it("still issues the token when recording usage fails", async () => {
    recordMachineAccountUsageMock.mockRejectedValue(new Error("db down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await GET(
      tokenRequest({ scope: "repository:own/app:pull", password: SECRET }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toHaveProperty("token");
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("resolves by secret only and never tries a bm_ password as user password or PAT", async () => {
    const response = await GET(
      tokenRequest({ username: "admin@localhost", password: SECRET }),
    );

    expect(response.status).toBe(200);
    expect(resolveMachineAccountMock).toHaveBeenCalledWith(SECRET);
    expect(findUserByEmailMock).not.toHaveBeenCalled();
    expect(verifyPasswordMock).not.toHaveBeenCalled();
    expect(resolvePatMock).not.toHaveBeenCalled();
  });

  it("never resolves a machine account for a bt_ token or a user password", async () => {
    for (const password of ["bt_looks-like-a-pat", "a user password"]) {
      await GET(tokenRequest({ username: "admin@localhost", password }));
    }

    expect(resolveMachineAccountMock).not.toHaveBeenCalled();
  });

  it("answers 401 for an unknown, disabled or expired secret, with or without scope", async () => {
    for (const scope of [undefined, "repository:own/app:pull"]) {
      const response = await GET(
        tokenRequest({ scope, password: `${MACHINE_ACCOUNT_PREFIX}unknown` }),
      );
      expect(response.status).toBe(401);
      expect(await response.json()).not.toHaveProperty("token");
    }
    expect(findUserByEmailMock).not.toHaveBeenCalled();
    expect(resolvePatMock).not.toHaveBeenCalled();
  });

  it("denies push on another private repository and a pull-only push on its own", async () => {
    const other = await GET(
      tokenRequest({ scope: "repository:other/app:push", password: SECRET }),
    );
    expect(other.status).toBe(403);

    resolveMachineAccountMock.mockResolvedValue({
      ...account,
      allowPush: false,
    });
    const pullOnly = await GET(
      tokenRequest({ scope: "repository:own/app:push", password: SECRET }),
    );
    expect(pullOnly.status).toBe(403);
    expect(await pullOnly.json()).not.toHaveProperty("token");
  });

  it("denies pull on another private repository and a missing repository", async () => {
    const other = await GET(
      tokenRequest({ scope: "repository:other/app:pull", password: SECRET }),
    );
    expect(other.status).toBe(403);
    expect((await other.json()).error.code).toBe("forbidden");

    findMissingRepositoriesMock.mockResolvedValue(["missing"]);
    const missing = await GET(
      tokenRequest({ scope: "repository:missing/app:pull", password: SECRET }),
    );
    expect(missing.status).toBe(403);
    expect((await missing.json()).error.code).toBe("repository_not_found");
  });

  it("grants pull on another repository's image that allows anonymous pull", async () => {
    overridesMock.mockResolvedValue(new Map([["shared", "allow"]]));

    const response = await GET(
      tokenRequest({
        scope: "repository:other/shared:pull,push",
        password: SECRET,
      }),
    );

    expect(response.status).toBe(200);
    expect(decodeJwt((await response.json()).token).access).toEqual([
      { type: "repository", name: "other/shared", actions: ["pull"] },
    ]);
  });

  it("rate limits per machine account in a namespace no user email can reach", async () => {
    vi.stubEnv("RATE_LIMIT_TOKEN_MAX_ATTEMPTS", "2");
    getSessionUserMock.mockResolvedValue({
      id: "user-1",
      email: `machine:${ACCOUNT_ID}`,
      systemRole: "user",
    });

    const statuses: number[] = [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      statuses.push((await GET(tokenRequest({}))).status);
    }
    expect(statuses).toEqual([200, 200, 429]);

    const machine = await GET(
      tokenRequest({ scope: "repository:own/app:pull", password: SECRET }),
    );
    expect(machine.status).toBe(200);
  });

  it("limits repeated machine requests from one account with 429", async () => {
    vi.stubEnv("RATE_LIMIT_TOKEN_MAX_ATTEMPTS", "2");

    const statuses: number[] = [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      statuses.push(
        (
          await GET(
            tokenRequest({
              scope: "repository:own/app:pull",
              password: SECRET,
            }),
          )
        ).status,
      );
    }

    expect(statuses).toEqual([200, 200, 429]);
  });

  it("keeps the machine limiter separate from the user limiter at the bucket level", () => {
    vi.stubEnv("RATE_LIMIT_TOKEN_MAX_ATTEMPTS", "1");
    expect(checkMachineTokenRateLimit("192.0.2.1", ACCOUNT_ID)).toBe(true);
    expect(checkMachineTokenRateLimit("192.0.2.2", ACCOUNT_ID)).toBe(false);
  });
});

describe("registry token verification of the machine claim", () => {
  beforeEach(() => {
    vi.stubEnv("TOKEN_SIGNING_KEY_PATH", "docker/token/dev-signing-key.pem");
    vi.stubEnv("TOKEN_CERT_PATH", "docker/registry/certs/rootcert.pem");
    vi.stubEnv("TOKEN_ISSUER", "registry");
    vi.stubEnv("REGISTRY_AUTH_TOKEN_SERVICE", "registry");
    resetSigningKeyCache();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetSigningKeyCache();
  });

  it("returns machineAccountId from the claim only", async () => {
    const machine = await issueRegistryToken(
      `machine:${ACCOUNT_ID}`,
      "registry",
      [],
      { machineAccountId: ACCOUNT_ID },
    );
    expect(await verifyRegistryBearerToken(machine.token)).toEqual({
      ok: true,
      subject: `machine:${ACCOUNT_ID}`,
      machineAccountId: ACCOUNT_ID,
    });

    const spoofed = await issueRegistryToken(
      `machine:${ACCOUNT_ID}`,
      "registry",
      [],
    );
    const verified = await verifyRegistryBearerToken(spoofed.token);
    expect(verified).toEqual({ ok: true, subject: `machine:${ACCOUNT_ID}` });
    expect(verified).not.toHaveProperty("machineAccountId");
  });
});
