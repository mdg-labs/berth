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

async function createProject(sessionId: string, name: string): Promise<string | null> {
  const response = await fetch(`${INTEGRATION_BASE_URL}/api/projects`, {
    method: "POST",
    headers: {
      ...csrfHeaders(CLIENT_IP),
      ...cookieHeader(SESSION_COOKIE, sessionId),
    },
    body: JSON.stringify({ name, isPublic: false }),
  });

  if (response.status !== 201) {
    return null;
  }

  const body = (await response.json()) as { project: { id: string; name: string } };
  return body.project.id;
}

describe("catalog API integration", () => {
  let ready = false;
  let credentialsReady = false;

  beforeAll(async () => {
    ready = await isIntegrationTargetReady();
    const tokenReady = ready && (await hasTokenRoutes());
    credentialsReady = tokenReady && (await canLoginWithConfiguredCredentials());
  });

  it("returns catalog, tags, and tag detail for an authenticated project member", async () => {
    if (!credentialsReady) {
      return;
    }

    const sessionId = await loginSession();
    if (!sessionId) {
      return;
    }

    const suffix = Date.now().toString(36);
    const projectName = `cat${suffix}`.slice(0, 20);
    const projectId = await createProject(sessionId, projectName);
    if (!projectId) {
      return;
    }

    const catalogResponse = await fetch(
      `${INTEGRATION_BASE_URL}/api/projects/${projectId}/catalog`,
      {
        headers: cookieHeader(SESSION_COOKIE, sessionId),
      },
    );

    expect(catalogResponse.status).toBe(200);
    const catalog = (await catalogResponse.json()) as {
      repositories: { name: string; tagCount: number }[];
    };
    expect(Array.isArray(catalog.repositories)).toBe(true);

    const tagsResponse = await fetch(
      `${INTEGRATION_BASE_URL}/api/projects/${projectId}/repos/hello/tags`,
      {
        headers: cookieHeader(SESSION_COOKIE, sessionId),
      },
    );

    expect(tagsResponse.status).toBe(200);
    const tags = (await tagsResponse.json()) as {
      tags: unknown[];
      total: number;
    };
    expect(Array.isArray(tags.tags)).toBe(true);
    expect(tags.total).toBeGreaterThanOrEqual(0);
  });
});
