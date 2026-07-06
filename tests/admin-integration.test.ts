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
const CLIENT_IP = "203.0.113.70";

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

describe("admin API integration", () => {
  let ready = false;
  let adminRoutesReady = false;
  let credentialsReady = false;

  beforeAll(async () => {
    ready = await isIntegrationTargetReady();
    adminRoutesReady = ready && (await hasAdminRoutes());
    credentialsReady =
      adminRoutesReady && (await canLoginWithConfiguredCredentials());
  });

  it("returns 401 for unauthenticated admin users list", async () => {
    if (!adminRoutesReady) {
      return;
    }

    const response = await fetch(`${INTEGRATION_BASE_URL}/api/admin/users`);
    expect(response.status).toBe(401);
  });

  it("allows system admin to list and create users", async () => {
    if (!credentialsReady) {
      return;
    }

    const sessionId = await loginSession();
    if (!sessionId) {
      return;
    }

    const list = await fetch(`${INTEGRATION_BASE_URL}/api/admin/users`, {
      headers: cookieHeader(SESSION_COOKIE, sessionId),
    });
    expect(list.status).toBe(200);
    const listBody = (await list.json()) as { users: { email: string }[] };
    expect(listBody.users.some((user) => user.email === INTEGRATION_ADMIN_EMAIL)).toBe(
      true,
    );

    const email = `p9-user-${Date.now()}@example.com`;
    const create = await fetch(`${INTEGRATION_BASE_URL}/api/admin/users`, {
      method: "POST",
      headers: {
        ...csrfHeaders(CLIENT_IP),
        ...cookieHeader(SESSION_COOKIE, sessionId),
      },
      body: JSON.stringify({
        email,
        name: "P9 Test User",
        password: "temporary-password-123",
        systemRole: "user",
      }),
    });

    expect(create.status).toBe(201);
    const created = (await create.json()) as {
      user: { email: string; systemRole: string };
    };
    expect(created.user.email).toBe(email);
    expect(created.user.systemRole).toBe("user");
  });

  it("returns GC status with volume size and command for admin", async () => {
    if (!credentialsReady) {
      return;
    }

    const sessionId = await loginSession();
    if (!sessionId) {
      return;
    }

    const response = await fetch(`${INTEGRATION_BASE_URL}/api/admin/gc/status`, {
      headers: cookieHeader(SESSION_COOKIE, sessionId),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      status: {
        storageHuman: string;
        gcCommand: string;
        warnings: string[];
      };
    };

    expect(body.status.storageHuman).toBeTruthy();
    expect(body.status.gcCommand).toContain("garbage-collect");
    expect(body.status.gcCommand).toContain("docker/compose.yml");
    expect(body.status.warnings.length).toBeGreaterThan(0);
  });
});

describe("admin API forbidden for non-admin", () => {
  let adminRoutesReady = false;
  let credentialsReady = false;
  let adminSessionId: string | null = null;

  beforeAll(async () => {
    const ready = await isIntegrationTargetReady();
    adminRoutesReady = ready && (await hasAdminRoutes());
    credentialsReady =
      adminRoutesReady && (await canLoginWithConfiguredCredentials());
    if (credentialsReady) {
      adminSessionId = await loginSession();
    }
  });

  it("returns 403 when a non-admin user calls admin routes", async () => {
    if (!credentialsReady || !adminSessionId) {
      return;
    }

    const email = `p9-regular-${Date.now()}@example.com`;
    const create = await fetch(`${INTEGRATION_BASE_URL}/api/admin/users`, {
      method: "POST",
      headers: {
        ...csrfHeaders(CLIENT_IP),
        ...cookieHeader(SESSION_COOKIE, adminSessionId),
      },
      body: JSON.stringify({
        email,
        name: "Regular User",
        password: "regular-user-password",
        systemRole: "user",
      }),
    });

    expect(create.status).toBe(201);

    const login = await fetch(`${INTEGRATION_BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: csrfHeaders("203.0.113.71"),
      body: JSON.stringify({
        email,
        password: "regular-user-password",
      }),
    });

    expect(login.status).toBe(200);
    const userSession = extractSetCookie(login, SESSION_COOKIE);
    if (!userSession) {
      return;
    }

    const users = await fetch(`${INTEGRATION_BASE_URL}/api/admin/users`, {
      headers: cookieHeader(SESSION_COOKIE, userSession),
    });
    expect(users.status).toBe(403);

    const gc = await fetch(`${INTEGRATION_BASE_URL}/api/admin/gc/status`, {
      headers: cookieHeader(SESSION_COOKIE, userSession),
    });
    expect(gc.status).toBe(403);
  });
});

describe("project settings members integration", () => {
  let adminRoutesReady = false;
  let credentialsReady = false;

  beforeAll(async () => {
    const ready = await isIntegrationTargetReady();
    adminRoutesReady = ready && (await hasAdminRoutes());
    credentialsReady =
      adminRoutesReady && (await canLoginWithConfiguredCredentials());
  });

  it("adds, changes role, and removes a project member", async () => {
    if (!credentialsReady) {
      return;
    }

    const sessionId = await loginSession();
    if (!sessionId) {
      return;
    }

    const repositoryName = `p9settings${Date.now()}`;
    const createRepository = await fetch(`${INTEGRATION_BASE_URL}/api/repositories`, {
      method: "POST",
      headers: {
        ...csrfHeaders(CLIENT_IP),
        ...cookieHeader(SESSION_COOKIE, sessionId),
      },
      body: JSON.stringify({ name: repositoryName }),
    });

    expect(createRepository.status).toBe(201);
    const { repository } = (await createRepository.json()) as {
      repository: { id: string };
    };

    const memberEmail = `p9-member-${Date.now()}@example.com`;
    const createUser = await fetch(`${INTEGRATION_BASE_URL}/api/admin/users`, {
      method: "POST",
      headers: {
        ...csrfHeaders(CLIENT_IP),
        ...cookieHeader(SESSION_COOKIE, sessionId),
      },
      body: JSON.stringify({
        email: memberEmail,
        name: "Settings Member",
        password: "member-password-123",
        systemRole: "user",
      }),
    });
    expect(createUser.status).toBe(201);
    const createdUser = (await createUser.json()) as {
      user: { id: string };
    };

    const addMember = await fetch(
      `${INTEGRATION_BASE_URL}/api/repositories/${repository.id}/members`,
      {
        method: "POST",
        headers: {
          ...csrfHeaders(CLIENT_IP),
          ...cookieHeader(SESSION_COOKIE, sessionId),
        },
        body: JSON.stringify({
          email: memberEmail,
          role: "developer",
        }),
      },
    );
    expect(addMember.status).toBe(201);

    const patchRole = await fetch(
      `${INTEGRATION_BASE_URL}/api/repositories/${repository.id}/members/${createdUser.user.id}`,
      {
        method: "PATCH",
        headers: {
          ...csrfHeaders(CLIENT_IP),
          ...cookieHeader(SESSION_COOKIE, sessionId),
        },
        body: JSON.stringify({ role: "maintainer" }),
      },
    );
    expect(patchRole.status).toBe(200);

    const members = await fetch(
      `${INTEGRATION_BASE_URL}/api/repositories/${repository.id}/members`,
      { headers: cookieHeader(SESSION_COOKIE, sessionId) },
    );
    expect(members.status).toBe(200);
    const membersBody = (await members.json()) as {
      members: { type: string; email: string; role?: string }[];
    };
    const member = membersBody.members.find(
      (entry) => entry.type === "user" && entry.email === memberEmail,
    );
    expect(member?.role).toBe("maintainer");

    const removeMember = await fetch(
      `${INTEGRATION_BASE_URL}/api/repositories/${repository.id}/members/${createdUser.user.id}`,
      {
        method: "DELETE",
        headers: {
          ...csrfHeaders(CLIENT_IP),
          ...cookieHeader(SESSION_COOKIE, sessionId),
        },
      },
    );
    expect(removeMember.status).toBe(200);
  });
});
