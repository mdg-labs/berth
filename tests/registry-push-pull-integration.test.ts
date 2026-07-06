// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { execSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
const CLIENT_IP = "203.0.113.70";

function basicAuthHeader(username: string, password: string): HeadersInit {
  const encoded = Buffer.from(`${username}:${password}`).toString("base64");
  return { Authorization: `Basic ${encoded}` };
}

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

async function createProject(
  sessionId: string,
  name: string,
  isPublic = false,
): Promise<string | null> {
  const response = await fetch(`${INTEGRATION_BASE_URL}/api/projects`, {
    method: "POST",
    headers: {
      ...csrfHeaders(CLIENT_IP),
      ...cookieHeader(SESSION_COOKIE, sessionId),
    },
    body: JSON.stringify({ name, isPublic }),
  });

  if (response.status !== 201) {
    return null;
  }

  const body = (await response.json()) as { project: { name: string } };
  return body.project.name;
}

async function fetchRegistryToken(
  scope: string,
  auth?: HeadersInit,
): Promise<string | null> {
  const response = await fetch(
    `${INTEGRATION_BASE_URL}/api/auth/token?service=registry&scope=${encodeURIComponent(scope)}`,
    { headers: auth },
  );

  if (response.status !== 200) {
    return null;
  }

  const body = (await response.json()) as { token: string };
  return body.token;
}

describe("registry push/pull integration", () => {
  let ready = false;
  let tokenReady = false;
  let credentialsReady = false;
  let dockerReady = false;
  let registryHost = "localhost:8080";
  let dockerLoggedIn = false;
  let sessionId: string | null = null;

  beforeAll(async () => {
    ready = await isIntegrationTargetReady();
    tokenReady = ready && (await hasTokenRoutes());
    credentialsReady = tokenReady && (await canLoginWithConfiguredCredentials());
    dockerReady = credentialsReady && dockerAvailable();
    registryHost = new URL(INTEGRATION_BASE_URL).host;

    if (credentialsReady) {
      sessionId = await loginSession();
    }

    if (dockerReady) {
      try {
        runDocker(
          `sh -c 'printf %s "${INTEGRATION_ADMIN_PASSWORD}" | docker login ${registryHost} -u ${INTEGRATION_ADMIN_EMAIL} --password-stdin'`,
        );
        dockerLoggedIn = true;
      } catch {
        dockerLoggedIn = false;
      }
    }
  });

  it("rejects invalid bearer tokens at the proxy", async () => {
    if (!tokenReady) {
      return;
    }

    const response = await fetch(`${INTEGRATION_BASE_URL}/v2/`, {
      headers: { Authorization: "Bearer not-a-valid-jwt" },
      redirect: "manual",
    });

    expect(response.status).toBe(401);
  });

  it("denies push token for non-member on private project", async () => {
    if (!credentialsReady) {
      return;
    }

    const response = await fetch(
      `${INTEGRATION_BASE_URL}/api/auth/token?service=registry&scope=${encodeURIComponent("repository:private-nonmember/hello:push,pull")}`,
    );

    expect(response.status).toBe(403);
  });

  it("rewrites upload Location headers away from internal registry host", async () => {
    if (!credentialsReady || !sessionId) {
      return;
    }

    const projectName = `loc${Date.now()}`;
    const created = await createProject(sessionId, projectName, false);
    if (!created) {
      return;
    }

    const token = await fetchRegistryToken(
      `repository:${projectName}/hello:push,pull`,
      basicAuthHeader(INTEGRATION_ADMIN_EMAIL, INTEGRATION_ADMIN_PASSWORD),
    );
    if (!token) {
      return;
    }

    const response = await fetch(
      `${INTEGRATION_BASE_URL}/v2/${projectName}/hello/blobs/uploads/`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        redirect: "manual",
      },
    );

    expect([202, 201]).toContain(response.status);
    const location = response.headers.get("location");
    expect(location).toBeTruthy();
    expect(location).not.toContain("registry:5000");
    expect(location).toMatch(/^https?:\/\/[^/]+\/v2\//);
  });

  it("streams a large blob upload without failing mid-upload", async () => {
    if (!credentialsReady || !sessionId) {
      return;
    }

    const projectName = `chunk${Date.now()}`;
    const created = await createProject(sessionId, projectName, false);
    if (!created) {
      return;
    }

    const token = await fetchRegistryToken(
      `repository:${projectName}/hello:push,pull`,
      basicAuthHeader(INTEGRATION_ADMIN_EMAIL, INTEGRATION_ADMIN_PASSWORD),
    );
    if (!token) {
      return;
    }

    const start = await fetch(
      `${INTEGRATION_BASE_URL}/v2/${projectName}/hello/blobs/uploads/`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        redirect: "manual",
      },
    );

    expect([202, 201]).toContain(start.status);
    const uploadUrl = start.headers.get("location");
    expect(uploadUrl).toBeTruthy();
    expect(uploadUrl).not.toContain("registry:5000");

    const chunkSize = 2 * 1024 * 1024;
    const body = Buffer.alloc(chunkSize, 0xab);

    const response = await fetch(uploadUrl!, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/octet-stream",
        "Content-Length": String(body.length),
      },
      body,
      redirect: "manual",
    });

    expect([202, 201, 204]).toContain(response.status);
    const location = response.headers.get("location");
    if (location) {
      expect(location).not.toContain("registry:5000");
    }
  });

  it("pushes and pulls an image through the proxy for a project member", async () => {
    if (!dockerReady || !dockerLoggedIn || !sessionId) {
      return;
    }

    const projectName = `push${Date.now()}`;
    const created = await createProject(sessionId, projectName, false);
    if (!created) {
      return;
    }

    const image = `${registryHost}/${projectName}/hello:1.0`;

    const buildDir = mkdtempSync(join(tmpdir(), "berth-push-"));
    writeFileSync(
      join(buildDir, "Dockerfile"),
      "FROM scratch\nCOPY hello.txt /\n",
    );
    writeFileSync(join(buildDir, "hello.txt"), "berth p6 push test\n");

    runDocker(`docker build -t ${image} ${buildDir}`);
    runDocker(`docker push ${image}`);
    runDocker(`docker rmi ${image}`);
    runDocker(`docker pull ${image}`);
  });

  it("allows anonymous docker pull on a public project", async () => {
    if (!dockerReady || !dockerLoggedIn || !sessionId) {
      return;
    }

    const projectName = `public${Date.now()}`;
    const created = await createProject(sessionId, projectName, true);
    if (!created) {
      return;
    }

    const image = `${registryHost}/${projectName}/hello:1.0`;

    const buildDir = mkdtempSync(join(tmpdir(), "berth-public-"));
    writeFileSync(
      join(buildDir, "Dockerfile"),
      "FROM scratch\nCOPY hello.txt /\n",
    );
    writeFileSync(join(buildDir, "hello.txt"), "berth public pull test\n");

    runDocker(`docker build -t ${image} ${buildDir}`);
    runDocker(`docker push ${image}`);
    runDocker(`docker rmi ${image}`);
    runDocker(`docker logout ${registryHost}`);

    runDocker(`docker pull ${image}`);

    runDocker(
      `sh -c 'printf %s "${INTEGRATION_ADMIN_PASSWORD}" | docker login ${registryHost} -u ${INTEGRATION_ADMIN_EMAIL} --password-stdin'`,
    );
  });
});
