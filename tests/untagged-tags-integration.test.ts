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
const CLIENT_IP = "203.0.113.95";

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
    body: JSON.stringify({ name, isPublic: false }),
  });

  if (response.status !== 201) {
    return null;
  }

  const body = (await response.json()) as {
    repository: { id: string; name: string };
  };
  return body.repository;
}

function encodeRepoPath(imageName: string): string {
  return imageName
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

describe("untagged tags list integration", () => {
  let ready = false;
  let credentialsReady = false;
  let dockerReady = false;
  let registryHost = "localhost:8080";
  let dockerLoggedIn = false;
  let sessionId: string | null = null;

  beforeAll(async () => {
    ready = await isIntegrationTargetReady();
    const tokenReady = ready && (await hasTokenRoutes());
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

  it("lists orphaned digest after re-pushing the same tag", async () => {
    if (!dockerReady || !dockerLoggedIn || !sessionId) {
      return;
    }

    const repository = await createRepository(sessionId, `untagged${Date.now()}`);
    if (!repository) {
      return;
    }

    const image = `${registryHost}/${repository.name}/hello:dev`;
    const buildDir = mkdtempSync(join(tmpdir(), "berth-untagged-"));

    writeFileSync(
      join(buildDir, "Dockerfile"),
      "FROM scratch\nCOPY hello.txt /\n",
    );
    writeFileSync(join(buildDir, "hello.txt"), "first push\n");
    runDocker(`docker build -t ${image} ${buildDir}`);
    runDocker(`docker push ${image}`);

    writeFileSync(join(buildDir, "hello.txt"), "second push\n");
    runDocker(`docker build -t ${image} ${buildDir}`);
    runDocker(`docker push ${image}`);

    const tagsOnly = await fetch(
      `${INTEGRATION_BASE_URL}/api/repositories/${repository.id}/images/${encodeRepoPath("hello")}/tags`,
      { headers: cookieHeader(SESSION_COOKIE, sessionId) },
    );
    expect(tagsOnly.status).toBe(200);
    const tagsOnlyBody = (await tagsOnly.json()) as {
      tags: Array<{ name: string; isUntagged?: boolean }>;
      total: number;
    };
    expect(tagsOnlyBody.total).toBe(1);
    expect(tagsOnlyBody.tags[0]?.name).toBe("dev");
    expect(tagsOnlyBody.tags[0]?.isUntagged).toBeFalsy();

    const withUntagged = await fetch(
      `${INTEGRATION_BASE_URL}/api/repositories/${repository.id}/images/${encodeRepoPath("hello")}/tags?includeUntagged=true`,
      { headers: cookieHeader(SESSION_COOKIE, sessionId) },
    );
    expect(withUntagged.status).toBe(200);
    const withUntaggedBody = (await withUntagged.json()) as {
      tags: Array<{ name: string; isUntagged?: boolean; digest: string }>;
      total: number;
      untaggedSupported?: boolean;
    };

    expect(withUntaggedBody.untaggedSupported).toBe(true);
    expect(withUntaggedBody.total).toBe(2);
    expect(withUntaggedBody.tags.filter((tag) => tag.isUntagged)).toHaveLength(1);
    expect(withUntaggedBody.tags.some((tag) => tag.name === "dev")).toBe(true);
  });
});
