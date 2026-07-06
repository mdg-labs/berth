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
  hasAdminRoutes,
  isIntegrationTargetReady,
} from "./helpers/integration";

const SESSION_COOKIE = "berth_session";
const CLIENT_IP = "203.0.113.71";

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

describe("account API integration", () => {
  let ready = false;
  let credentialsReady = false;

  beforeAll(async () => {
    ready = await isIntegrationTargetReady();
    const adminRoutesReady = ready && (await hasAdminRoutes());
    credentialsReady =
      adminRoutesReady && (await canLoginWithConfiguredCredentials());
  });

  it("returns 401 for unauthenticated account access", async () => {
    if (!ready) {
      return;
    }

    const response = await fetch(`${INTEGRATION_BASE_URL}/api/account`);
    expect(response.status).toBe(401);
  });

  it("allows name-only profile updates without current password", async () => {
    if (!credentialsReady) {
      return;
    }

    const sessionId = await loginSession();
    if (!sessionId) {
      return;
    }

    const me = await fetch(`${INTEGRATION_BASE_URL}/api/auth/me`, {
      headers: cookieHeader(SESSION_COOKIE, sessionId),
    });
    expect(me.status).toBe(200);
    const meBody = (await me.json()) as {
      user: { name: string; hasPassword: boolean };
    };

    if (!meBody.user.hasPassword) {
      return;
    }

    const originalName = meBody.user.name;
    const nextName = `${originalName} Updated`;

    const patch = await fetch(`${INTEGRATION_BASE_URL}/api/account`, {
      method: "PATCH",
      headers: {
        ...csrfHeaders(CLIENT_IP),
        ...cookieHeader(SESSION_COOKIE, sessionId),
      },
      body: JSON.stringify({ name: nextName }),
    });
    expect(patch.status).toBe(200);
    const patchBody = (await patch.json()) as { user: { name: string } };
    expect(patchBody.user.name).toBe(nextName);

    const restore = await fetch(`${INTEGRATION_BASE_URL}/api/account`, {
      method: "PATCH",
      headers: {
        ...csrfHeaders(CLIENT_IP),
        ...cookieHeader(SESSION_COOKIE, sessionId),
      },
      body: JSON.stringify({ name: originalName }),
    });
    expect(restore.status).toBe(200);
  });

  it("requires current password when changing email", async () => {
    if (!credentialsReady) {
      return;
    }

    const sessionId = await loginSession();
    if (!sessionId) {
      return;
    }

    const me = await fetch(`${INTEGRATION_BASE_URL}/api/auth/me`, {
      headers: cookieHeader(SESSION_COOKIE, sessionId),
    });
    const meBody = (await me.json()) as {
      user: { email: string; hasPassword: boolean };
    };

    if (!meBody.user.hasPassword) {
      return;
    }

    const patch = await fetch(`${INTEGRATION_BASE_URL}/api/account`, {
      method: "PATCH",
      headers: {
        ...csrfHeaders(CLIENT_IP),
        ...cookieHeader(SESSION_COOKIE, sessionId),
      },
      body: JSON.stringify({
        email: `changed-${Date.now()}@example.com`,
      }),
    });

    expect(patch.status).toBe(400);
  });
});
