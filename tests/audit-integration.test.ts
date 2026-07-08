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
const CLIENT_IP = "203.0.113.80";

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

describe("audit log API integration", () => {
  let ready = false;
  let adminRoutesReady = false;
  let credentialsReady = false;

  beforeAll(async () => {
    ready = await isIntegrationTargetReady();
    adminRoutesReady = ready && (await hasAdminRoutes());
    credentialsReady =
      adminRoutesReady && (await canLoginWithConfiguredCredentials());
  });

  it("returns 401 for unauthenticated admin audit list", async () => {
    if (!adminRoutesReady) {
      return;
    }

    const response = await fetch(`${INTEGRATION_BASE_URL}/api/admin/audit`);
    expect(response.status).toBe(401);
  });

  it("returns paginated audit entries for system admin after login", async () => {
    if (!credentialsReady) {
      return;
    }

    const sessionId = await loginSession();
    if (!sessionId) {
      return;
    }

    const audit = await fetch(
      `${INTEGRATION_BASE_URL}/api/admin/audit?page=1&pageSize=10&search=auth.login`,
      {
        headers: cookieHeader(SESSION_COOKIE, sessionId),
      },
    );

    expect(audit.status).toBe(200);
    const body = (await audit.json()) as {
      entries: { action: string; resource: string }[];
      total: number;
      page: number;
      pageSize: number;
      actions: string[];
    };

    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(10);
    expect(Array.isArray(body.entries)).toBe(true);
    expect(Array.isArray(body.actions)).toBe(true);
    expect(body.entries.some((entry) => entry.action === "auth.login")).toBe(true);
  });

  it("returns repository-scoped audit entries for repo admin", async () => {
    if (!credentialsReady) {
      return;
    }

    const sessionId = await loginSession();
    if (!sessionId) {
      return;
    }

    const repositoryName = `audit${Date.now()}`;
    const create = await fetch(`${INTEGRATION_BASE_URL}/api/repositories`, {
      method: "POST",
      headers: {
        ...csrfHeaders(CLIENT_IP),
        ...cookieHeader(SESSION_COOKIE, sessionId),
      },
      body: JSON.stringify({ name: repositoryName }),
    });

    expect(create.status).toBe(201);
    const created = (await create.json()) as {
      repository: { id: string; name: string };
    };

    const audit = await fetch(
      `${INTEGRATION_BASE_URL}/api/repositories/${created.repository.id}/audit?action=repository.create`,
      {
        headers: cookieHeader(SESSION_COOKIE, sessionId),
      },
    );

    expect(audit.status).toBe(200);
    const body = (await audit.json()) as {
      entries: { action: string; resource: string; repositoryId: string | null }[];
      total: number;
    };

    expect(body.total).toBeGreaterThanOrEqual(1);
    expect(
      body.entries.every(
        (entry) =>
          entry.repositoryId === created.repository.id &&
          entry.action === "repository.create",
      ),
    ).toBe(true);
  });
});
