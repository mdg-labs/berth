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
const CLIENT_IP = "203.0.113.72";

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

describe("admin user lifecycle integration", () => {
  let credentialsReady = false;

  beforeAll(async () => {
    const ready = await isIntegrationTargetReady();
    const adminRoutesReady = ready && (await hasAdminRoutes());
    credentialsReady =
      adminRoutesReady && (await canLoginWithConfiguredCredentials());
  });

  it("supports detail, update, soft delete, and reactivate flows", async () => {
    if (!credentialsReady) {
      return;
    }

    const sessionId = await loginSession();
    if (!sessionId) {
      return;
    }

    const authHeaders = {
      ...csrfHeaders(CLIENT_IP),
      ...cookieHeader(SESSION_COOKIE, sessionId),
    };

    const email = `lifecycle-${Date.now()}@example.com`;
    const create = await fetch(`${INTEGRATION_BASE_URL}/api/admin/users`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        email,
        name: "Lifecycle User",
        password: "temporary-password-123",
        systemRole: "user",
      }),
    });
    expect(create.status).toBe(201);
    const created = (await create.json()) as {
      user: { id: string; email: string; status: string };
    };
    expect(created.user.status).toBe("active");

    const detail = await fetch(
      `${INTEGRATION_BASE_URL}/api/admin/users/${created.user.id}`,
      { headers: cookieHeader(SESSION_COOKIE, sessionId) },
    );
    expect(detail.status).toBe(200);
    const detailBody = (await detail.json()) as {
      user: { email: string };
      meta: { deleteGracePeriodDays: number };
    };
    expect(detailBody.user.email).toBe(email);
    expect(detailBody.meta.deleteGracePeriodDays).toBeGreaterThanOrEqual(0);

    const patch = await fetch(
      `${INTEGRATION_BASE_URL}/api/admin/users/${created.user.id}`,
      {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify({ name: "Lifecycle User Updated" }),
      },
    );
    expect(patch.status).toBe(200);

    const deleted = await fetch(
      `${INTEGRATION_BASE_URL}/api/admin/users/${created.user.id}`,
      {
        method: "DELETE",
        headers: authHeaders,
      },
    );
    expect(deleted.status).toBe(200);

    const afterDelete = await fetch(
      `${INTEGRATION_BASE_URL}/api/admin/users/${created.user.id}`,
      { headers: cookieHeader(SESSION_COOKIE, sessionId) },
    );
    expect(afterDelete.status).toBe(200);
    const afterDeleteBody = (await afterDelete.json()) as {
      user: { status: string; purgesAt: string | null };
    };
    expect(afterDeleteBody.user.status).toBe("pending_deletion");
    expect(afterDeleteBody.user.purgesAt).toBeTruthy();

    const reactivated = await fetch(
      `${INTEGRATION_BASE_URL}/api/admin/users/${created.user.id}/reactivate`,
      {
        method: "POST",
        headers: authHeaders,
      },
    );
    expect(reactivated.status).toBe(200);

    const afterReactivate = await fetch(
      `${INTEGRATION_BASE_URL}/api/admin/users/${created.user.id}`,
      { headers: cookieHeader(SESSION_COOKIE, sessionId) },
    );
    const afterReactivateBody = (await afterReactivate.json()) as {
      user: { status: string };
    };
    expect(afterReactivateBody.user.status).toBe("active");

    const cleanup = await fetch(
      `${INTEGRATION_BASE_URL}/api/admin/users/${created.user.id}`,
      {
        method: "DELETE",
        headers: authHeaders,
      },
    );
    expect(cleanup.status).toBe(200);
  });

  it("prevents deleting your own account", async () => {
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
    const meBody = (await me.json()) as { user: { id: string } };

    const response = await fetch(
      `${INTEGRATION_BASE_URL}/api/admin/users/${meBody.user.id}`,
      {
        method: "DELETE",
        headers: {
          ...csrfHeaders(CLIENT_IP),
          ...cookieHeader(SESSION_COOKIE, sessionId),
        },
      },
    );

    expect(response.status).toBe(403);
  });
});
