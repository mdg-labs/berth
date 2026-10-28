// Copyright (c) 2026 Michael David Guggenbichler (MDG Labs), licensed under Apache-2.0 — see LICENSE

import { describe, expect, it } from "vitest";

import { pushHelloTag } from "../e2e/helpers/registry-push";
import {
  INTEGRATION_ADMIN_EMAIL,
  INTEGRATION_ADMIN_PASSWORD,
  INTEGRATION_BASE_URL,
  cookieHeader,
  csrfHeaders,
  extractSetCookie,
} from "./helpers/integration";

const SESSION_COOKIE = "berth_session";
const CLIENT_IP = "203.0.113.80";

process.env.PLAYWRIGHT_BASE_URL ??= INTEGRATION_BASE_URL;

function basic(username: string, password: string) {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

describe.skipIf(!process.env.MACHINE_ACCOUNT_REGISTRY_INTEGRATION)(
  "machine account docker login against the running stack",
  () => {
    it("pushes and pulls through /v2 with a machine account token", async () => {
      const login = await fetch(`${INTEGRATION_BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: csrfHeaders(CLIENT_IP),
        body: JSON.stringify({
          email: INTEGRATION_ADMIN_EMAIL,
          password: INTEGRATION_ADMIN_PASSWORD,
        }),
      });
      expect(login.status).toBe(200);
      const session = extractSetCookie(login, SESSION_COOKIE);
      expect(session).toBeTruthy();
      const sessionHeaders = {
        ...csrfHeaders(CLIENT_IP),
        ...cookieHeader(SESSION_COOKIE, session!),
      };

      const stamp = Date.now().toString(36);
      const repositories: { id: string; name: string }[] = [];
      for (const name of [`mown${stamp}`, `mother${stamp}`]) {
        const created = await fetch(`${INTEGRATION_BASE_URL}/api/repositories`, {
          method: "POST",
          headers: sessionHeaders,
          body: JSON.stringify({ name, isPublic: false }),
        });
        expect(created.status).toBe(201);
        repositories.push((await created.json()).repository);
      }
      const [own, other] = repositories as [
        { id: string; name: string },
        { id: string; name: string },
      ];

      const account = await fetch(
        `${INTEGRATION_BASE_URL}/api/repositories/${own.id}/machine-accounts`,
        {
          method: "POST",
          headers: sessionHeaders,
          body: JSON.stringify({
            name: "ci",
            allowPull: true,
            allowPush: true,
          }),
        },
      );
      expect(account.status).toBe(201);
      const { secret, machineAccount } = await account.json();

      const login401 = await fetch(
        `${INTEGRATION_BASE_URL}/api/auth/token?service=registry`,
        { headers: { Authorization: basic(machineAccount.username, secret) } },
      );
      expect(login401.status).toBe(200);

      await pushHelloTag(own.name, "app", "1.0", {
        email: machineAccount.username,
        password: secret,
      });

      const pullToken = (
        await (
          await fetch(
            `${INTEGRATION_BASE_URL}/api/auth/token?service=registry&scope=${encodeURIComponent(`repository:${own.name}/app:pull`)}`,
            { headers: { Authorization: basic("ignored", secret) } },
          )
        ).json()
      ).token as string;

      const manifest = await fetch(
        `${INTEGRATION_BASE_URL}/v2/${own.name}/app/manifests/1.0`,
        {
          headers: {
            Authorization: `Bearer ${pullToken}`,
            Accept: "application/vnd.docker.distribution.manifest.v2+json",
          },
        },
      );
      expect(manifest.status).toBe(200);

      const withoutToken = await fetch(
        `${INTEGRATION_BASE_URL}/v2/${own.name}/app/manifests/1.0`,
        { redirect: "manual" },
      );
      expect(withoutToken.status).toBe(401);

      const pushOther = await fetch(
        `${INTEGRATION_BASE_URL}/api/auth/token?service=registry&scope=${encodeURIComponent(`repository:${other.name}/app:push,pull`)}`,
        { headers: { Authorization: basic("ignored", secret) } },
      );
      expect(pushOther.status).toBe(403);

      const tokenForOwn = (
        await (
          await fetch(
            `${INTEGRATION_BASE_URL}/api/auth/token?service=registry&scope=${encodeURIComponent(`repository:${own.name}/app:pull,push,delete`)}`,
            { headers: { Authorization: basic("ignored", secret) } },
          )
        ).json()
      ).token as string;
      const deleted = await fetch(
        `${INTEGRATION_BASE_URL}/v2/${own.name}/app/manifests/${manifest.headers.get("docker-content-digest")}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${tokenForOwn}` } },
      );
      expect([401, 403]).toContain(deleted.status);
    });
  },
);
