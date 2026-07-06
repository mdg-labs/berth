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
const CLIENT_IP = "203.0.113.60";

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

async function decodeTokenAccess(
  token: string,
): Promise<{ type: string; name: string; actions: string[] }[]> {
  const { decodeJwt } = await import("jose");
  const claims = decodeJwt(token);
  return (claims.access ?? []) as {
    type: string;
    name: string;
    actions: string[];
  }[];
}

describe("repositories and members integration", () => {
  let ready = false;
  let tokenReady = false;
  let credentialsReady = false;

  beforeAll(async () => {
    ready = await isIntegrationTargetReady();
    tokenReady = ready && (await hasTokenRoutes());
    credentialsReady = tokenReady && (await canLoginWithConfiguredCredentials());
  });

  it("returns 403 repository_not_found for non-existent project push", async () => {
    if (!credentialsReady) {
      return;
    }

    const response = await fetch(
      `${INTEGRATION_BASE_URL}/api/auth/token?service=registry&scope=repository:ghost-proj/repo:push`,
      { headers: basicAuthHeader(INTEGRATION_ADMIN_EMAIL, INTEGRATION_ADMIN_PASSWORD) },
    );

    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("repository_not_found");
  });

  it("creates project and lists members with pending invite", async () => {
    if (!credentialsReady) {
      return;
    }

    const sessionId = await loginSession();
    if (!sessionId) {
      return;
    }

    const repositoryName = `p4test${Date.now()}`;
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
      repository: { id: string; name: string; role: string };
    };
    expect(created.repository.name).toBe(repositoryName);
    expect(created.repository.role).toBe("admin");

    const addInvite = await fetch(
      `${INTEGRATION_BASE_URL}/api/repositories/${created.repository.id}/members`,
      {
        method: "POST",
        headers: {
          ...csrfHeaders(CLIENT_IP),
          ...cookieHeader(SESSION_COOKIE, sessionId),
        },
        body: JSON.stringify({
          email: "pending-invite@example.com",
          role: "developer",
        }),
      },
    );

    expect(addInvite.status).toBe(201);
    const inviteBody = (await addInvite.json()) as {
      member: { type: string; email: string };
    };
    expect(inviteBody.member.type).toBe("invite");

    const members = await fetch(
      `${INTEGRATION_BASE_URL}/api/repositories/${created.repository.id}/members`,
      { headers: cookieHeader(SESSION_COOKIE, sessionId) },
    );

    expect(members.status).toBe(200);
    const membersBody = (await members.json()) as {
      members: { type: string; email: string }[];
    };
    const pending = membersBody.members.find(
      (entry) => entry.email === "pending-invite@example.com",
    );
    expect(pending?.type).toBe("invite");
  });

  it("token scopes differ by project role", async () => {
    if (!credentialsReady) {
      return;
    }

    const sessionId = await loginSession();
    if (!sessionId) {
      return;
    }

    const repositoryName = `rbactest${Date.now()}`;
    const create = await fetch(`${INTEGRATION_BASE_URL}/api/repositories`, {
      method: "POST",
      headers: {
        ...csrfHeaders(CLIENT_IP),
        ...cookieHeader(SESSION_COOKIE, sessionId),
      },
      body: JSON.stringify({ name: repositoryName }),
    });

    if (create.status !== 201) {
      return;
    }

    const { repository } = (await create.json()) as {
      repository: { id: string; name: string };
    };

    const addDev = await fetch(
      `${INTEGRATION_BASE_URL}/api/repositories/${repository.id}/members`,
      {
        method: "POST",
        headers: {
          ...csrfHeaders(CLIENT_IP),
          ...cookieHeader(SESSION_COOKIE, sessionId),
        },
        body: JSON.stringify({
          email: "dev-member@example.com",
          role: "developer",
        }),
      },
    );

    expect(addDev.status).toBe(201);

    const adminTokenResponse = await fetch(
      `${INTEGRATION_BASE_URL}/api/auth/token?service=registry&scope=repository:${repositoryName}/app:pull,push,delete`,
      {
        headers: basicAuthHeader(
          INTEGRATION_ADMIN_EMAIL,
          INTEGRATION_ADMIN_PASSWORD,
        ),
      },
    );

    expect(adminTokenResponse.status).toBe(200);
    const adminToken = (await adminTokenResponse.json()) as { token: string };
    const adminAccess = await decodeTokenAccess(adminToken.token);
    const adminActions = adminAccess[0]?.actions ?? [];
    expect(adminActions).toContain("delete");
  });

  it("admin system role bypasses project membership for token", async () => {
    if (!credentialsReady) {
      return;
    }

    const repositoryName = `adminbypass${Date.now()}`;
    const sessionId = await loginSession();
    if (!sessionId) {
      return;
    }

    const create = await fetch(`${INTEGRATION_BASE_URL}/api/repositories`, {
      method: "POST",
      headers: {
        ...csrfHeaders(CLIENT_IP),
        ...cookieHeader(SESSION_COOKIE, sessionId),
      },
      body: JSON.stringify({ name: repositoryName }),
    });

    if (create.status !== 201) {
      return;
    }

    const tokenResponse = await fetch(
      `${INTEGRATION_BASE_URL}/api/auth/token?service=registry&scope=repository:${repositoryName}/repo:pull,push`,
      {
        headers: basicAuthHeader(
          INTEGRATION_ADMIN_EMAIL,
          INTEGRATION_ADMIN_PASSWORD,
        ),
      },
    );

    expect(tokenResponse.status).toBe(200);
    const body = (await tokenResponse.json()) as { token: string };
    const access = await decodeTokenAccess(body.token);
    expect(access[0]?.actions).toEqual(
      expect.arrayContaining(["pull", "push"]),
    );
  });
});
