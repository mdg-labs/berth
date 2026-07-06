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
const CLIENT_IP = "203.0.113.71";
const MANIFEST_ACCEPT =
  "application/vnd.docker.distribution.manifest.v2+json, application/vnd.oci.image.manifest.v1+json";

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

async function createRepository(
  sessionId: string,
  name: string,
): Promise<{ id: string; name: string } | null> {
  const response = await fetch(`${INTEGRATION_BASE_URL}/api/repositories`, {
    method: "POST",
    headers: {
      ...csrfHeaders(CLIENT_IP),
      ...cookieHeader(SESSION_COOKIE, sessionId),
    },
    body: JSON.stringify({ name }),
  });

  if (response.status !== 201) {
    return null;
  }

  const body = (await response.json()) as {
    repository: { id: string; name: string };
  };
  return body.repository;
}

async function fetchRegistryToken(scope: string): Promise<string | null> {
  const response = await fetch(
    `${INTEGRATION_BASE_URL}/api/auth/token?service=registry&scope=${encodeURIComponent(scope)}`,
    { headers: basicAuthHeader(INTEGRATION_ADMIN_EMAIL, INTEGRATION_ADMIN_PASSWORD) },
  );

  if (response.status !== 200) {
    return null;
  }

  const body = (await response.json()) as { token: string };
  return body.token;
}

async function pullManifest(
  repositoryName: string,
  imageName: string,
  tag: string,
  token: string,
): Promise<void> {
  const response = await fetch(
    `${INTEGRATION_BASE_URL}/v2/${repositoryName}/${imageName}/manifests/${encodeURIComponent(tag)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: MANIFEST_ACCEPT,
      },
    },
  );

  expect(response.status).toBe(200);
  expect(response.headers.get("docker-content-digest")).toBeTruthy();
}

describe("pull metrics integration", () => {
  let ready = false;
  let dockerReady = false;
  let sessionId: string | null = null;
  let registryHost = "localhost:8080";

  beforeAll(async () => {
    ready =
      (await isIntegrationTargetReady()) &&
      (await hasTokenRoutes()) &&
      (await canLoginWithConfiguredCredentials());
    dockerReady = ready && dockerAvailable();
    registryHost = new URL(INTEGRATION_BASE_URL).host;

    if (ready) {
      sessionId = await loginSession();
    }

    if (dockerReady) {
      try {
        runDocker(
          `sh -c 'printf %s "${INTEGRATION_ADMIN_PASSWORD}" | docker login ${registryHost} -u ${INTEGRATION_ADMIN_EMAIL} --password-stdin'`,
        );
      } catch {
        dockerReady = false;
      }
    }
  });

  it("dedupes sibling tag pulls for image and repository counters", async () => {
    if (!ready || !sessionId || !dockerReady) {
      return;
    }

    const repository = await createRepository(sessionId, `pulls${Date.now()}`);
    if (!repository) {
      return;
    }

    const imageBase = `${registryHost}/${repository.name}/hello`;
    const buildDir = mkdtempSync(join(tmpdir(), "berth-pull-metrics-"));
    writeFileSync(
      join(buildDir, "Dockerfile"),
      "FROM scratch\nCOPY hello.txt /\n",
    );
    writeFileSync(join(buildDir, "hello.txt"), "pull metrics sibling test\n");

    runDocker(`docker build -t ${imageBase}:v1 ${buildDir}`);
    runDocker(`docker push ${imageBase}:v1`);
    runDocker(`docker tag ${imageBase}:v1 ${imageBase}:v2`);
    runDocker(`docker push ${imageBase}:v2`);

    const token = await fetchRegistryToken(
      `repository:${repository.name}/hello:pull`,
    );
    if (!token) {
      return;
    }

    await pullManifest(repository.name, "hello", "v1", token);
    await pullManifest(repository.name, "hello", "v2", token);

    await new Promise((resolve) => setTimeout(resolve, 250));

    const tagsResponse = await fetch(
      `${INTEGRATION_BASE_URL}/api/repositories/${repository.id}/images/hello/tags?pageSize=10`,
      { headers: cookieHeader(SESSION_COOKIE, sessionId) },
    );
    expect(tagsResponse.status).toBe(200);
    const tagsBody = (await tagsResponse.json()) as {
      tags: Array<{ name: string; pullCount: number }>;
    };

    const v1 = tagsBody.tags.find((tag) => tag.name === "v1");
    const v2 = tagsBody.tags.find((tag) => tag.name === "v2");
    expect(v1?.pullCount).toBe(1);
    expect(v2?.pullCount).toBe(1);

    const catalogResponse = await fetch(
      `${INTEGRATION_BASE_URL}/api/repositories/${repository.id}/catalog`,
      { headers: cookieHeader(SESSION_COOKIE, sessionId) },
    );
    expect(catalogResponse.status).toBe(200);
    const catalogBody = (await catalogResponse.json()) as {
      repositoryPullCount: number;
      images: Array<{ name: string; pullCount: number }>;
    };

    expect(catalogBody.repositoryPullCount).toBe(1);
    expect(catalogBody.images.find((image) => image.name === "hello")?.pullCount).toBe(
      1,
    );
  });
});
