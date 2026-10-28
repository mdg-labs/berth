// Copyright (c) 2026 Michael David Guggenbichler (MDG Labs), licensed under Apache-2.0 — see LICENSE

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/auth/token/route";
import { MACHINE_ACCOUNT_PREFIX } from "@/lib/machine-accounts/config";
import { PAT_PREFIX } from "@/lib/pat/config";
import { resetRateLimits } from "@/lib/rate-limit/login";

const {
  resolveMachineAccountMock,
  findUserByEmailMock,
  verifyPasswordMock,
  resolvePatMock,
  getSessionUserMock,
} = vi.hoisted(() => ({
  resolveMachineAccountMock: vi.fn(),
  findUserByEmailMock: vi.fn(),
  verifyPasswordMock: vi.fn(),
  resolvePatMock: vi.fn(),
  getSessionUserMock: vi.fn(),
}));

vi.mock("@/lib/machine-accounts/store", () => ({
  resolveMachineAccount: resolveMachineAccountMock,
  recordMachineAccountUsage: vi.fn(async () => undefined),
}));

vi.mock("@/lib/machine-accounts/authorize", () => ({
  authorizeMachineTokenAccess: vi.fn(async (_machine, access) => ({
    ok: true,
    access,
  })),
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
}));

vi.mock("@/lib/session/request", () => ({
  getSessionUserFromRequest: getSessionUserMock,
}));

vi.mock("@/lib/token/authorize", () => ({
  authorizeTokenAccess: vi.fn(async (_user, access) => ({ ok: true, access })),
}));

vi.mock("@/lib/token/issue", () => ({
  issueRegistryToken: vi.fn(async () => ({
    token: "issued",
    expiresIn: 60,
    issuedAt: "2026-01-01T00:00:00Z",
  })),
}));

vi.mock("@/lib/token/config", () => ({
  getTokenService: () => "registry",
}));

const user = {
  id: "user-1",
  email: "user@example.com",
  passwordHash: "hash",
  systemRole: "user" as const,
};

function tokenRequest(options: {
  ip: string;
  username?: string;
  password?: string;
  authorization?: string;
  scope?: string;
}) {
  const headers: Record<string, string> = { "x-forwarded-for": options.ip };
  if (options.authorization !== undefined) {
    headers.authorization = options.authorization;
  } else if (options.password !== undefined) {
    headers.authorization = `Basic ${Buffer.from(
      `${options.username ?? "user@example.com"}:${options.password}`,
    ).toString("base64")}`;
  }
  const query = options.scope ? `&scope=${encodeURIComponent(options.scope)}` : "";
  return new NextRequest(
    `http://localhost/api/auth/token?service=registry${query}`,
    { headers },
  );
}

async function statuses(requests: NextRequest[]): Promise<number[]> {
  const result: number[] = [];
  for (const request of requests) {
    result.push((await GET(request)).status);
  }
  return result;
}

describe("token endpoint credential rate limits", () => {
  beforeEach(() => {
    vi.stubEnv("RATE_LIMIT_TOKEN_MAX_ATTEMPTS", "3");
    vi.stubEnv("RATE_LIMIT_WINDOW_SECONDS", "60");
    resetRateLimits();
    getSessionUserMock.mockResolvedValue(null);
    findUserByEmailMock.mockResolvedValue(user);
    verifyPasswordMock.mockResolvedValue(false);
    resolvePatMock.mockResolvedValue(null);
    resolveMachineAccountMock.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    resetRateLimits();
  });

  it("limits failed scope-less credentials from one IP", async () => {
    const result = await statuses(
      Array.from({ length: 4 }, (_, i) =>
        tokenRequest({
          ip: "198.51.100.1",
          username: `guess-${i}@example.com`,
          password: "wrong",
        }),
      ),
    );

    expect(result).toEqual([401, 401, 401, 429]);
  });

  it("limits failed credentials against one username across many IPs", async () => {
    const result = await statuses(
      Array.from({ length: 4 }, (_, i) =>
        tokenRequest({ ip: `198.51.100.${10 + i}`, password: "wrong" }),
      ),
    );

    expect(result).toEqual([401, 401, 401, 429]);
  });

  it("normalises the username like the portal login", async () => {
    const result = await statuses(
      ["User@Example.com", " user@example.com ", "USER@EXAMPLE.COM", "user@example.com"].map(
        (username, i) =>
          tokenRequest({ ip: `198.51.100.${20 + i}`, username, password: "wrong" }),
      ),
    );

    expect(result).toEqual([401, 401, 401, 429]);
  });

  it("limits failed credentials with a scope as before", async () => {
    const result = await statuses(
      Array.from({ length: 4 }, () =>
        tokenRequest({
          ip: "198.51.100.30",
          password: "wrong",
          scope: "repository:own/app:pull",
        }),
      ),
    );

    expect(result).toEqual([200, 200, 200, 429]);
  });

  it("checks no credential once a bucket is exhausted", async () => {
    const secrets = [
      `${MACHINE_ACCOUNT_PREFIX}secret`,
      `${PAT_PREFIX}secret`,
      "plain-password",
    ];

    for (const password of secrets) {
      resetRateLimits();
      vi.clearAllMocks();
      verifyPasswordMock.mockResolvedValue(false);
      findUserByEmailMock.mockResolvedValue(user);
      resolvePatMock.mockResolvedValue(null);
      resolveMachineAccountMock.mockResolvedValue(null);

      for (let i = 0; i < 3; i += 1) {
        await GET(tokenRequest({ ip: "198.51.100.40", password }));
      }
      const calls = () =>
        resolveMachineAccountMock.mock.calls.length +
        resolvePatMock.mock.calls.length +
        findUserByEmailMock.mock.calls.length +
        verifyPasswordMock.mock.calls.length;
      const before = calls();

      const byIp = await GET(tokenRequest({ ip: "198.51.100.40", password }));
      expect(byIp.status).toBe(429);
      expect(calls()).toBe(before);

      const byUsername = await GET(
        tokenRequest({ ip: "198.51.100.41", password }),
      );
      expect(byUsername.status).toBe(429);
      expect(calls()).toBe(before);
    }
  });

  it("limits a malformed Basic header per IP without checking a credential", async () => {
    const result = await statuses(
      Array.from({ length: 4 }, () =>
        tokenRequest({
          ip: "198.51.100.50",
          authorization: `Basic ${Buffer.from("no-separator").toString("base64")}`,
        }),
      ),
    );

    expect(result).toEqual([401, 401, 401, 429]);
    expect(findUserByEmailMock).not.toHaveBeenCalled();
    expect(verifyPasswordMock).not.toHaveBeenCalled();
  });

  it("limits a Basic header with an empty or undecodable payload", async () => {
    const result = await statuses(
      ["Basic ", "Basic !!!", "Basic !!!", "Basic "].map((authorization) =>
        tokenRequest({ ip: "198.51.100.51", authorization }),
      ),
    );

    expect(result).toEqual([401, 401, 401, 429]);
  });

  it("keys the IP bucket on the trusted-proxy hop, not the spoofable left entry", async () => {
    const result = await statuses(
      Array.from({ length: 4 }, (_, i) =>
        tokenRequest({
          ip: `203.0.113.${i}, 198.51.100.60`,
          username: `guess-${i}@example.com`,
          password: "wrong",
        }),
      ),
    );

    expect(result).toEqual([401, 401, 401, 429]);
  });

  it("lets successful user logins keep one IP bucket entry per request", async () => {
    verifyPasswordMock.mockResolvedValue(true);

    const result = await statuses(
      Array.from({ length: 4 }, () =>
        tokenRequest({ ip: "198.51.100.70", password: "correct" }),
      ),
    );

    expect(result).toEqual([200, 200, 200, 429]);
  });

  it("lets successful PAT logins keep one IP bucket entry per request", async () => {
    resolvePatMock.mockResolvedValue({
      user: { id: "user-1", email: "user@example.com", systemRole: "user" },
      pat: { id: "pat-1" },
      lastUsedAt: null,
    });

    const result = await statuses(
      Array.from({ length: 4 }, () =>
        tokenRequest({
          ip: "198.51.100.71",
          password: `${PAT_PREFIX}secret`,
        }),
      ),
    );

    expect(result).toEqual([200, 200, 200, 429]);
  });

  it("lets successful machine logins keep one IP bucket entry per request", async () => {
    resolveMachineAccountMock.mockResolvedValue({
      id: "machine-1",
      name: "ci",
      ownerRepositoryId: "repo-own",
      allowPull: true,
      allowPush: true,
      repositoryIds: ["repo-own"],
      lastUsedAt: null,
    });

    const result = await statuses(
      Array.from({ length: 4 }, () =>
        tokenRequest({
          ip: "198.51.100.72",
          password: `${MACHINE_ACCOUNT_PREFIX}secret`,
          scope: "repository:own/app:pull",
        }),
      ),
    );

    expect(result).toEqual([200, 200, 200, 429]);
  });

  it("does not let Basic usernames consume the anonymous pull bucket", async () => {
    for (let i = 0; i < 5; i += 1) {
      await GET(
        tokenRequest({
          ip: `198.51.100.${80 + i}`,
          username: "unauthenticated",
          password: "wrong",
        }),
      );
    }

    const anonymous = await GET(
      tokenRequest({ ip: "198.51.100.90", scope: "repository:own/app:pull" }),
    );
    expect(anonymous.status).toBe(200);
  });

  it("keeps anonymous scoped pulls on the unauthenticated limits", async () => {
    const result = await statuses(
      Array.from({ length: 4 }, () =>
        tokenRequest({ ip: "198.51.100.91", scope: "repository:own/app:pull" }),
      ),
    );

    expect(result).toEqual([200, 200, 200, 429]);
  });
});
