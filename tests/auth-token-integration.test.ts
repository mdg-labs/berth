// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { beforeAll, describe, expect, it } from "vitest";

import {
  INTEGRATION_ADMIN_EMAIL,
  INTEGRATION_ADMIN_PASSWORD,
  INTEGRATION_BASE_URL,
  canLoginWithConfiguredCredentials,
  hasTokenRoutes,
  isIntegrationTargetReady,
} from "./helpers/integration";

function basicAuthHeader(username: string, password: string): HeadersInit {
  const encoded = Buffer.from(`${username}:${password}`).toString("base64");
  return {
    Authorization: `Basic ${encoded}`,
  };
}

describe("token integration", () => {
  let ready = false;
  let tokenReady = false;
  let credentialsReady = false;

  beforeAll(async () => {
    ready = await isIntegrationTargetReady();
    tokenReady = ready && (await hasTokenRoutes());
    credentialsReady = tokenReady && (await canLoginWithConfiguredCredentials());
  });

  it("proxies /v2/ with WWW-Authenticate realm", async () => {
    if (!tokenReady) {
      return;
    }

    const response = await fetch(`${INTEGRATION_BASE_URL}/v2/`, {
      redirect: "manual",
    });

    expect([401, 308]).toContain(response.status);
    if (response.status === 308) {
      const location = response.headers.get("location");
      expect(location).toBeTruthy();
      const follow = await fetch(`${INTEGRATION_BASE_URL}${location}`, {
        redirect: "manual",
      });
      expect(follow.status).toBe(401);
      const authenticate = follow.headers.get("www-authenticate") ?? "";
      expect(authenticate).toContain("/api/auth/token");
      return;
    }

    const authenticate = response.headers.get("www-authenticate") ?? "";
    expect(authenticate).toContain("/api/auth/token");
    expect(authenticate.toLowerCase()).toContain("bearer");
  });

  it("rejects unauthenticated token requests", async () => {
    if (!tokenReady) {
      return;
    }

    const response = await fetch(
      `${INTEGRATION_BASE_URL}/api/auth/token?service=registry`,
    );
    expect(response.status).toBe(401);
  });

  it("returns 403 for missing project scope", async () => {
    if (!credentialsReady) {
      return;
    }

    const response = await fetch(
      `${INTEGRATION_BASE_URL}/api/auth/token?service=registry&scope=repository:missing-project/repo:pull`,
      {
        headers: basicAuthHeader(
          INTEGRATION_ADMIN_EMAIL,
          INTEGRATION_ADMIN_PASSWORD,
        ),
      },
    );

    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("repository_not_found");
  });

  it("issues JWT for existing project scope via Basic auth", async () => {
    if (!credentialsReady) {
      return;
    }

    const createRepository = await fetch(`${INTEGRATION_BASE_URL}/api/repositories`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "registry-portal",
      },
      body: JSON.stringify({ name: "test" }),
    });

    if (createRepository.status === 404) {
      return;
    }

    const response = await fetch(
      `${INTEGRATION_BASE_URL}/api/auth/token?service=registry&scope=repository:test/repo:pull`,
      {
        headers: basicAuthHeader(
          INTEGRATION_ADMIN_EMAIL,
          INTEGRATION_ADMIN_PASSWORD,
        ),
      },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      token: string;
      access_token: string;
      expires_in: number;
    };
    expect(body.token).toBeTruthy();
    expect(body.access_token).toBe(body.token);
    expect(body.expires_in).toBeGreaterThan(0);
    expect(body.token.split(".")).toHaveLength(3);
  });

  it("issues token for docker login without repository scope", async () => {
    if (!credentialsReady) {
      return;
    }

    const response = await fetch(
      `${INTEGRATION_BASE_URL}/api/auth/token?service=registry`,
      {
        headers: basicAuthHeader(
          INTEGRATION_ADMIN_EMAIL,
          INTEGRATION_ADMIN_PASSWORD,
        ),
      },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { token: string };
    expect(body.token.split(".")).toHaveLength(3);
  });
});
