// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { execSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { hashSync } from "bcryptjs";
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
const CLIENT_IP = "203.0.113.90";
const DEVELOPER_EMAIL = "p8-developer@localhost";
const DEVELOPER_PASSWORD = "p8-dev-password";
const MAINTAINER_EMAIL = "p8-maintainer@localhost";
const MAINTAINER_PASSWORD = "p8-maint-password";

function dockerAvailable(): boolean {
  try {
    execSync("docker version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function runDocker(command: string): string {
  return execSync(command, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 300_000,
  }).trim();
}

function seedIntegrationUser(email: string, password: string): void {
  const passwordHash = hashSync(password, 12).replace(/'/g, "''");
  const sql = `INSERT INTO users (email, name, password_hash, system_role, must_change_password)
VALUES ('${email}', '${email}', '${passwordHash}', 'user', false)
ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, system_role = 'user';`;

  runDocker(
    `docker compose -f docker/compose.yml exec -T postgres psql -U berth -d berth -c "${sql}"`,
  );
}

async function login(email: string, password: string): Promise<string | null> {
  const loginResponse = await fetch(`${INTEGRATION_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: csrfHeaders(CLIENT_IP),
    body: JSON.stringify({ email, password }),
  });

  if (loginResponse.status !== 200) {
    return null;
  }

  return extractSetCookie(loginResponse, SESSION_COOKIE);
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

  const body = (await response.json()) as { project: { id: string } };
  return body.project.id;
}

async function addMember(
  adminSessionId: string,
  projectId: string,
  email: string,
  role: "developer" | "maintainer",
): Promise<boolean> {
  const response = await fetch(
    `${INTEGRATION_BASE_URL}/api/projects/${projectId}/members`,
    {
      method: "POST",
      headers: {
        ...csrfHeaders(CLIENT_IP),
        ...cookieHeader(SESSION_COOKIE, adminSessionId),
      },
      body: JSON.stringify({ email, role }),
    },
  );

  return response.status === 201;
}

function pushImage(registryHost: string, image: string): void {
  const buildDir = mkdtempSync(join(tmpdir(), "berth-delete-"));
  writeFileSync(
    join(buildDir, "Dockerfile"),
    "FROM scratch\nCOPY hello.txt /\n",
  );
  writeFileSync(join(buildDir, "hello.txt"), `berth delete test ${image}\n`);
  runDocker(`docker build -t ${image} ${buildDir}`);
  runDocker(`docker push ${image}`);
}

describe("delete API integration", () => {
  let ready = false;
  let credentialsReady = false;
  let dockerReady = false;
  let registryHost = "localhost:8080";
  let adminSessionId: string | null = null;

  beforeAll(async () => {
    ready = await isIntegrationTargetReady();
    const tokenReady = ready && (await hasTokenRoutes());
    credentialsReady = tokenReady && (await canLoginWithConfiguredCredentials());
    dockerReady = credentialsReady && dockerAvailable();
    registryHost = new URL(INTEGRATION_BASE_URL).host;

    if (credentialsReady) {
      adminSessionId = await login(
        INTEGRATION_ADMIN_EMAIL,
        INTEGRATION_ADMIN_PASSWORD,
      );
    }

    if (dockerReady) {
      try {
        seedIntegrationUser(DEVELOPER_EMAIL, DEVELOPER_PASSWORD);
        seedIntegrationUser(MAINTAINER_EMAIL, MAINTAINER_PASSWORD);
        runDocker(
          `sh -c 'printf %s "${INTEGRATION_ADMIN_PASSWORD}" | docker login ${registryHost} -u ${INTEGRATION_ADMIN_EMAIL} --password-stdin'`,
        );
      } catch {
        dockerReady = false;
      }
    }
  });

  it("deletes a tag and removes it from the tag list", async () => {
    if (!dockerReady || !adminSessionId) {
      return;
    }

    const projectName = `del${Date.now()}`;
    const projectId = await createProject(adminSessionId, projectName);
    if (!projectId) {
      return;
    }

    const image = `${registryHost}/${projectName}/hello:1.0`;
    pushImage(registryHost, image);

    const tagsBefore = await fetch(
      `${INTEGRATION_BASE_URL}/api/projects/${projectId}/repos/hello/tags`,
      { headers: cookieHeader(SESSION_COOKIE, adminSessionId) },
    );
    expect(tagsBefore.status).toBe(200);
    const beforeBody = (await tagsBefore.json()) as { tags: { name: string }[] };
    expect(beforeBody.tags.some((entry) => entry.name === "1.0")).toBe(true);

    const deleteResponse = await fetch(
      `${INTEGRATION_BASE_URL}/api/projects/${projectId}/repos/hello/tags/1.0`,
      {
        method: "DELETE",
        headers: {
          ...csrfHeaders(CLIENT_IP),
          ...cookieHeader(SESSION_COOKIE, adminSessionId),
        },
      },
    );
    expect(deleteResponse.status).toBe(200);

    const tagsAfter = await fetch(
      `${INTEGRATION_BASE_URL}/api/projects/${projectId}/repos/hello/tags`,
      { headers: cookieHeader(SESSION_COOKIE, adminSessionId) },
    );
    const afterBody = (await tagsAfter.json()) as { tags: { name: string }[] };
    expect(afterBody.tags.some((entry) => entry.name === "1.0")).toBe(false);
  });

  it("reports sibling tags sharing the same digest", async () => {
    if (!dockerReady || !adminSessionId) {
      return;
    }

    const projectName = `sib${Date.now()}`;
    const projectId = await createProject(adminSessionId, projectName);
    if (!projectId) {
      return;
    }

    const imageBase = `${registryHost}/${projectName}/hello`;
    pushImage(registryHost, `${imageBase}:v1`);
    runDocker(`docker tag ${imageBase}:v1 ${imageBase}:v2`);
    runDocker(`docker push ${imageBase}:v2`);

    const siblingsResponse = await fetch(
      `${INTEGRATION_BASE_URL}/api/projects/${projectId}/repos/hello/tags/v1/siblings`,
      { headers: cookieHeader(SESSION_COOKIE, adminSessionId) },
    );
    expect(siblingsResponse.status).toBe(200);
    const siblings = (await siblingsResponse.json()) as {
      siblings: { name: string }[];
    };
    expect(siblings.siblings.map((entry) => entry.name)).toContain("v2");
  });

  it("denies delete for developer and allows maintainer", async () => {
    if (!dockerReady || !adminSessionId) {
      return;
    }

    const projectName = `rbac${Date.now()}`;
    const projectId = await createProject(adminSessionId, projectName);
    if (!projectId) {
      return;
    }

    await addMember(adminSessionId, projectId, DEVELOPER_EMAIL, "developer");
    await addMember(adminSessionId, projectId, MAINTAINER_EMAIL, "maintainer");

    const image = `${registryHost}/${projectName}/hello:rbac`;
    pushImage(registryHost, image);

    const developerSession = await login(DEVELOPER_EMAIL, DEVELOPER_PASSWORD);
    const maintainerSession = await login(MAINTAINER_EMAIL, MAINTAINER_PASSWORD);
    if (!developerSession || !maintainerSession) {
      return;
    }

    const denied = await fetch(
      `${INTEGRATION_BASE_URL}/api/projects/${projectId}/repos/hello/tags/rbac`,
      {
        method: "DELETE",
        headers: {
          ...csrfHeaders(CLIENT_IP),
          ...cookieHeader(SESSION_COOKIE, developerSession),
        },
      },
    );
    expect(denied.status).toBe(403);

    const allowed = await fetch(
      `${INTEGRATION_BASE_URL}/api/projects/${projectId}/repos/hello/tags/rbac`,
      {
        method: "DELETE",
        headers: {
          ...csrfHeaders(CLIENT_IP),
          ...cookieHeader(SESSION_COOKIE, maintainerSession),
        },
      },
    );
    expect(allowed.status).toBe(200);
  });

  it(
    "bulk-deletes tags and deletes an entire repository",
    async () => {
    if (!dockerReady || !adminSessionId) {
      return;
    }

    const projectName = `bulk${Date.now()}`;
    const projectId = await createProject(adminSessionId, projectName);
    if (!projectId) {
      return;
    }

    const imageBase = `${registryHost}/${projectName}/bulkrepo`;
    pushImage(registryHost, `${imageBase}:a`);
    runDocker(`docker tag ${imageBase}:a ${imageBase}:b`);
    runDocker(`docker push ${imageBase}:b`);

    const bulkDelete = await fetch(
      `${INTEGRATION_BASE_URL}/api/projects/${projectId}/repos/bulkrepo/tags/bulk-delete`,
      {
        method: "POST",
        headers: {
          ...csrfHeaders(CLIENT_IP),
          ...cookieHeader(SESSION_COOKIE, adminSessionId),
        },
        body: JSON.stringify({ tags: ["a", "b"] }),
      },
    );
    expect(bulkDelete.status).toBe(200);

    const tagsAfterBulk = await fetch(
      `${INTEGRATION_BASE_URL}/api/projects/${projectId}/repos/bulkrepo/tags`,
      { headers: cookieHeader(SESSION_COOKIE, adminSessionId) },
    );
    const bulkBody = (await tagsAfterBulk.json()) as {
      tags: { name: string }[];
      total: number;
    };
    expect(bulkBody.total).toBe(0);

    pushImage(registryHost, `${imageBase}:c`);

    const repoDelete = await fetch(
      `${INTEGRATION_BASE_URL}/api/projects/${projectId}/repos/bulkrepo`,
      {
        method: "DELETE",
        headers: {
          ...csrfHeaders(CLIENT_IP),
          ...cookieHeader(SESSION_COOKIE, adminSessionId),
        },
      },
    );
    expect(repoDelete.status).toBe(200);

    const tagsAfterRepo = await fetch(
      `${INTEGRATION_BASE_URL}/api/projects/${projectId}/repos/bulkrepo/tags`,
      { headers: cookieHeader(SESSION_COOKIE, adminSessionId) },
    );
    const repoBody = (await tagsAfterRepo.json()) as {
      tags: { name: string }[];
      total: number;
    };
    expect(repoBody.total).toBe(0);
    expect(repoBody.tags).toEqual([]);
  },
  120_000,
  );
});
