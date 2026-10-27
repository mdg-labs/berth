// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { beforeAll, describe, expect, it } from "vitest";

import {
  INTEGRATION_ADMIN_EMAIL,
  INTEGRATION_ADMIN_PASSWORD,
  INTEGRATION_BASE_URL,
  canLoginWithConfiguredCredentials,
  cookieHeader,
  csrfHeaders,
  extractSetCookie,
  hasTokenRoutes,
  isIntegrationTargetReady,
} from "./helpers/integration";

const SESSION_COOKIE = "berth_session";
const CLIENT_IP = "203.0.113.71";

function basicAuthHeader(username: string, password: string): HeadersInit {
  const encoded = Buffer.from(`${username}:${password}`).toString("base64");
  return { Authorization: `Basic ${encoded}` };
}

async function loginSession(): Promise<string | null> {
  const login = await fetch(`${INTEGRATION_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: csrfHeaders(CLIENT_IP),
    body: JSON.stringify({
      email: INTEGRATION_ADMIN_EMAIL,
      password: INTEGRATION_ADMIN_PASSWORD,
    }),
  });

  if (login.status !== 200) {
    return null;
  }

  return extractSetCookie(login, SESSION_COOKIE);
}

describe("personal access token integration", () => {
  let ready = false;
  let credentialsReady = false;
  let sessionId: string | null = null;

  beforeAll(async () => {
    ready = await isIntegrationTargetReady();
    credentialsReady =
      ready &&
      (await hasTokenRoutes()) &&
      (await canLoginWithConfiguredCredentials());

    if (credentialsReady) {
      sessionId = await loginSession();
    }
  });

  it("creates a pull-only PAT and uses it at the token endpoint", async () => {
    if (!credentialsReady || !sessionId) {
      return;
    }

    const create = await fetch(`${INTEGRATION_BASE_URL}/api/account/tokens`, {
      method: "POST",
      headers: {
        ...csrfHeaders(CLIENT_IP),
        ...cookieHeader(SESSION_COOKIE, sessionId),
      },
      body: JSON.stringify({
        name: `integration-${Date.now()}`,
        allowPull: true,
        allowPush: false,
        expiresAt: null,
        repositoryIds: null,
      }),
    });

    expect(create.status).toBe(200);
    const created = (await create.json()) as { token: string };

    const pullTokenResponse = await fetch(
      `${INTEGRATION_BASE_URL}/api/auth/token?service=registry&scope=${encodeURIComponent("repository:any-repo/image:pull")}`,
      { headers: basicAuthHeader(INTEGRATION_ADMIN_EMAIL, created.token) },
    );
    expect(pullTokenResponse.status).toBe(200);

    const pushTokenResponse = await fetch(
      `${INTEGRATION_BASE_URL}/api/auth/token?service=registry&scope=${encodeURIComponent("repository:any-repo/image:push,pull")}`,
      { headers: basicAuthHeader(INTEGRATION_ADMIN_EMAIL, created.token) },
    );
    expect(pushTokenResponse.status).toBe(403);
  });

  it("rotates a PAT and invalidates the previous secret", async () => {
    if (!credentialsReady || !sessionId) {
      return;
    }

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const create = await fetch(`${INTEGRATION_BASE_URL}/api/account/tokens`, {
      method: "POST",
      headers: {
        ...csrfHeaders(CLIENT_IP),
        ...cookieHeader(SESSION_COOKIE, sessionId),
      },
      body: JSON.stringify({
        name: `rotate-${Date.now()}`,
        allowPull: true,
        allowPush: false,
        expiresAt,
        repositoryIds: null,
      }),
    });

    expect(create.status).toBe(200);
    const created = (await create.json()) as {
      token: string;
      summary: { id: string; expiresAt: string };
    };

    const rotate = await fetch(
      `${INTEGRATION_BASE_URL}/api/account/tokens/${created.summary.id}/rotate`,
      {
        method: "POST",
        headers: {
          ...csrfHeaders(CLIENT_IP),
          ...cookieHeader(SESSION_COOKIE, sessionId),
        },
        body: JSON.stringify({ resetExpiry: false }),
      },
    );

    expect(rotate.status).toBe(200);
    const rotated = (await rotate.json()) as {
      token: string;
      summary: { expiresAt: string };
    };
    expect(rotated.summary.expiresAt).toBe(created.summary.expiresAt);

    const oldTokenResponse = await fetch(
      `${INTEGRATION_BASE_URL}/api/auth/token?service=registry&scope=${encodeURIComponent("repository:any-repo/image:pull")}`,
      { headers: basicAuthHeader(INTEGRATION_ADMIN_EMAIL, created.token) },
    );
    expect(oldTokenResponse.status).toBe(401);

    const newTokenResponse = await fetch(
      `${INTEGRATION_BASE_URL}/api/auth/token?service=registry&scope=${encodeURIComponent("repository:any-repo/image:pull")}`,
      { headers: basicAuthHeader(INTEGRATION_ADMIN_EMAIL, rotated.token) },
    );
    expect(newTokenResponse.status).toBe(200);

    const rotateWithReset = await fetch(
      `${INTEGRATION_BASE_URL}/api/account/tokens/${created.summary.id}/rotate`,
      {
        method: "POST",
        headers: {
          ...csrfHeaders(CLIENT_IP),
          ...cookieHeader(SESSION_COOKIE, sessionId),
        },
        body: JSON.stringify({ resetExpiry: true }),
      },
    );
    expect(rotateWithReset.status).toBe(200);
    const resetRotated = (await rotateWithReset.json()) as {
      summary: { expiresAt: string };
    };
    expect(new Date(resetRotated.summary.expiresAt).getTime()).toBeGreaterThan(
      Date.now(),
    );
  });

  it("updates admin PAT policy settings", async () => {
    if (!credentialsReady || !sessionId) {
      return;
    }

    const patch = await fetch(`${INTEGRATION_BASE_URL}/api/admin/settings`, {
      method: "PATCH",
      headers: {
        ...csrfHeaders(CLIENT_IP),
        ...cookieHeader(SESSION_COOKIE, sessionId),
      },
      body: JSON.stringify({
        patMaxValidityDays: 30,
        patAllowNeverExpire: true,
      }),
    });

    expect(patch.status).toBe(200);
    const body = (await patch.json()) as {
      settings: { patMaxValidityDays: number | null };
    };
    expect(body.settings.patMaxValidityDays).toBe(30);
  });
});
