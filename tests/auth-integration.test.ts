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
  hasAuthRoutes,
  isIntegrationTargetReady,
} from "./helpers/integration";

const SESSION_COOKIE = "berth_session";
const LOGIN_CLIENT_IP = "203.0.113.50";
const RATE_LIMIT_CLIENT_IP = "203.0.113.200";

describe("auth integration", () => {
  let ready = false;
  let authReady = false;
  let credentialsReady = false;

  beforeAll(async () => {
    ready = await isIntegrationTargetReady();
    authReady = ready && (await hasAuthRoutes());
    credentialsReady = authReady && (await canLoginWithConfiguredCredentials());
  });

  it("health and ready endpoints respond", async () => {
    if (!ready) {
      return;
    }

    const health = await fetch(`${INTEGRATION_BASE_URL}/api/health`);
    expect(health.status).toBe(200);

    const readiness = await fetch(`${INTEGRATION_BASE_URL}/api/ready`);
    expect(readiness.status).toBe(200);
  });

  it("rejects POST without CSRF header", async () => {
    if (!authReady) {
      return;
    }

    const response = await fetch(`${INTEGRATION_BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: INTEGRATION_ADMIN_EMAIL,
        password: "wrong-password",
      }),
    });

    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("csrf_missing");
  });

  it("login → me → logout revokes session", async () => {
    if (!credentialsReady) {
      return;
    }

    const login = await fetch(`${INTEGRATION_BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: csrfHeaders(LOGIN_CLIENT_IP),
      body: JSON.stringify({
        email: INTEGRATION_ADMIN_EMAIL,
        password: INTEGRATION_ADMIN_PASSWORD,
      }),
    });

    expect(login.status).toBe(200);
    const sessionId = extractSetCookie(login, SESSION_COOKIE);
    expect(sessionId).toBeTruthy();

    const me = await fetch(`${INTEGRATION_BASE_URL}/api/auth/me`, {
      headers: cookieHeader(SESSION_COOKIE, sessionId!),
    });
    expect(me.status).toBe(200);
    const meBody = (await me.json()) as {
      user: { email: string; systemRole: string };
    };
    expect(meBody.user.email).toBe(INTEGRATION_ADMIN_EMAIL);
    expect(meBody.user.systemRole).toBe("admin");

    const logout = await fetch(`${INTEGRATION_BASE_URL}/api/auth/logout`, {
      method: "POST",
      headers: {
        ...csrfHeaders(LOGIN_CLIENT_IP),
        ...cookieHeader(SESSION_COOKIE, sessionId!),
      },
    });
    expect(logout.status).toBe(200);

    const meAfterLogout = await fetch(`${INTEGRATION_BASE_URL}/api/auth/me`, {
      headers: cookieHeader(SESSION_COOKIE, sessionId!),
    });
    expect(meAfterLogout.status).toBe(401);
  });

  it("returns 429 after login rate limit threshold", async () => {
    if (!authReady) {
      return;
    }

    let saw429 = false;

    for (let attempt = 0; attempt < 12; attempt += 1) {
      const response = await fetch(`${INTEGRATION_BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: csrfHeaders(RATE_LIMIT_CLIENT_IP),
        body: JSON.stringify({
          email: `rate-limit-${attempt}@example.com`,
          password: "wrong-password",
        }),
      });

      if (response.status === 429) {
        saw429 = true;
        const body = (await response.json()) as { error: { code: string } };
        expect(body.error.code).toBe("rate_limited");
        break;
      }
    }

    expect(saw429).toBe(true);
  });
});
