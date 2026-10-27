// Copyright (c) 2026 Michael David Guggenbichler (MDG Labs), licensed under Apache-2.0 — see LICENSE

import { getTableConfig } from "drizzle-orm/pg-core";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  GET,
  POST,
} from "@/app/api/admin/machine-accounts/route";
import {
  DELETE,
  PATCH,
} from "@/app/api/admin/machine-accounts/[accountId]/route";
import { requiresCsrfHeader } from "@/lib/csrf/check";
import { machineAccountRepositories } from "@/lib/db/schema";

const mocks = vi.hoisted(() => ({
  getSessionUserFromRequest: vi.fn(),
  listAllMachineAccounts: vi.fn(),
  createHostMachineAccount: vi.fn(),
  updateHostMachineAccount: vi.fn(),
  deleteMachineAccountAsAdmin: vi.fn(),
}));

vi.mock("@/lib/session/request", () => ({
  getSessionUserFromRequest: mocks.getSessionUserFromRequest,
}));

vi.mock("@/lib/machine-accounts/store", () => ({
  listAllMachineAccounts: mocks.listAllMachineAccounts,
  createHostMachineAccount: mocks.createHostMachineAccount,
  updateHostMachineAccount: mocks.updateHostMachineAccount,
  deleteMachineAccountAsAdmin: mocks.deleteMachineAccountAsAdmin,
}));

const BASE = "http://localhost/api/admin/machine-accounts";
const ACCOUNT_ID = "22222222-2222-4222-8222-222222222222";
const REPO_A = "11111111-1111-4111-8111-111111111111";
const REPO_B = "33333333-3333-4333-8333-333333333333";

const sessionUser = (systemRole: "admin" | "user") => ({
  id: "user-1",
  name: "Ada",
  email: "ada@example.com",
  systemRole,
});

const itemContext = { params: Promise.resolve({ accountId: ACCOUNT_ID }) };

function jsonRequest(method: string, body: unknown, url = BASE) {
  return new NextRequest(url, {
    method,
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const summary = {
  id: ACCOUNT_ID,
  kind: "host",
  name: "deploy",
  description: null,
  username: "host+deploy",
  repositories: [{ id: REPO_A, name: "acme" }],
  tokenPrefix: "bm_abcdefghi",
  allowPull: true,
  allowPush: false,
  createdBy: { id: "user-1", name: "Ada" },
  createdAt: "2026-01-01T00:00:00.000Z",
};

function allCalls() {
  return [
    () => GET(new NextRequest(BASE)),
    () => POST(jsonRequest("POST", { name: "deploy", repositoryIds: [REPO_A] })),
    () =>
      PATCH(
        jsonRequest("PATCH", { description: "x" }, `${BASE}/${ACCOUNT_ID}`),
        itemContext,
      ),
    () =>
      DELETE(
        new NextRequest(`${BASE}/${ACCOUNT_ID}`, { method: "DELETE" }),
        itemContext,
      ),
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSessionUserFromRequest.mockResolvedValue(sessionUser("admin"));
  mocks.listAllMachineAccounts.mockResolvedValue([summary]);
  mocks.createHostMachineAccount.mockResolvedValue({
    ok: true,
    secret: "bm_secret",
    summary,
  });
  mocks.updateHostMachineAccount.mockResolvedValue({ ok: true, summary });
  mocks.deleteMachineAccountAsAdmin.mockResolvedValue(true);
});

function expectNoStoreCalls() {
  expect(mocks.listAllMachineAccounts).not.toHaveBeenCalled();
  expect(mocks.createHostMachineAccount).not.toHaveBeenCalled();
  expect(mocks.updateHostMachineAccount).not.toHaveBeenCalled();
  expect(mocks.deleteMachineAccountAsAdmin).not.toHaveBeenCalled();
}

describe("admin machine account routes authorization", () => {
  it("answers 401 without a session on every route", async () => {
    mocks.getSessionUserFromRequest.mockResolvedValue(null);

    for (const call of allCalls()) {
      expect((await call()).status).toBe(401);
    }
    expectNoStoreCalls();
  });

  it("answers 403 for a signed-in non-admin on every route", async () => {
    mocks.getSessionUserFromRequest.mockResolvedValue(sessionUser("user"));

    for (const call of allCalls()) {
      expect((await call()).status).toBe(403);
    }
    expectNoStoreCalls();
  });

  it("allows a system admin", async () => {
    for (const call of allCalls()) {
      expect((await call()).status).toBeLessThan(300);
    }
  });

  it("keeps the routes under the middleware CSRF check", () => {
    expect(requiresCsrfHeader("POST", new URL(BASE).pathname)).toBe(true);
    expect(requiresCsrfHeader("PATCH", `/api/admin/machine-accounts/${ACCOUNT_ID}`)).toBe(true);
    expect(requiresCsrfHeader("DELETE", `/api/admin/machine-accounts/${ACCOUNT_ID}`)).toBe(true);
  });
});

describe("POST /api/admin/machine-accounts", () => {
  it("returns the summary and the secret once", async () => {
    const response = await POST(
      jsonRequest("POST", {
        name: "Deploy",
        description: " hosts ",
        repositoryIds: [REPO_A, REPO_B, REPO_A],
      }),
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      machineAccount: summary,
      secret: "bm_secret",
    });
    expect(mocks.createHostMachineAccount).toHaveBeenCalledWith(
      { id: "user-1", name: "Ada" },
      {
        name: "deploy",
        description: "hosts",
        repositoryIds: [REPO_A, REPO_B],
        expiresAt: null,
      },
      expect.anything(),
    );
  });

  it.each([
    ["malformed JSON", "{"],
    ["a non-object body", "[]"],
    ["a missing name", { repositoryIds: [REPO_A] }],
    ["a name that is not a slug", { name: "bad name", repositoryIds: [REPO_A] }],
    ["no repositoryIds", { name: "deploy" }],
    ["an empty repositoryIds", { name: "deploy", repositoryIds: [] }],
    ["a non-array repositoryIds", { name: "deploy", repositoryIds: REPO_A }],
    ["a non-uuid repository id", { name: "deploy", repositoryIds: ["acme"] }],
    ["a non-string repository id", { name: "deploy", repositoryIds: [1] }],
    [
      "more repositories than allowed",
      {
        name: "deploy",
        repositoryIds: Array.from(
          { length: 101 },
          (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        ),
      },
    ],
    ["allowPush true", { name: "deploy", repositoryIds: [REPO_A], allowPush: true }],
    ["allowPull false", { name: "deploy", repositoryIds: [REPO_A], allowPull: false }],
    ["a string permission", { name: "deploy", repositoryIds: [REPO_A], allowPush: "no" }],
    ["a non-string description", { name: "deploy", repositoryIds: [REPO_A], description: 1 }],
  ])("returns 400 for %s", async (_label, body) => {
    const response = await POST(jsonRequest("POST", body));

    expect(response.status).toBe(400);
    expect(mocks.createHostMachineAccount).not.toHaveBeenCalled();
  });

  it("returns 409 for a duplicate name", async () => {
    mocks.createHostMachineAccount.mockResolvedValue({
      ok: false,
      error: "duplicate_name",
    });

    const response = await POST(
      jsonRequest("POST", { name: "deploy", repositoryIds: [REPO_A] }),
    );

    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("conflict");
  });

  it("returns 400 for an unknown repository id", async () => {
    mocks.createHostMachineAccount.mockResolvedValue({
      ok: false,
      error: "repository_not_found",
    });

    const response = await POST(
      jsonRequest("POST", { name: "deploy", repositoryIds: [REPO_A] }),
    );

    expect(response.status).toBe(400);
  });
});

describe("PATCH and DELETE /api/admin/machine-accounts/[accountId]", () => {
  it("passes the replacement list and description to the store", async () => {
    const response = await PATCH(
      jsonRequest(
        "PATCH",
        { repositoryIds: [REPO_B], description: "" },
        `${BASE}/${ACCOUNT_ID}`,
      ),
      itemContext,
    );

    expect(response.status).toBe(200);
    expect(JSON.stringify(await response.json())).not.toContain("secret");
    expect(mocks.updateHostMachineAccount).toHaveBeenCalledWith(
      { id: "user-1" },
      ACCOUNT_ID,
      { repositoryIds: [REPO_B], description: null },
      expect.anything(),
    );
  });

  it.each([
    ["an empty body", {}],
    ["an empty list", { repositoryIds: [] }],
    ["a non-array list", { repositoryIds: "x" }],
    ["a non-string description", { description: 5 }],
    ["malformed JSON", "{"],
  ])("returns 400 for %s", async (_label, body) => {
    const response = await PATCH(
      jsonRequest("PATCH", body, `${BASE}/${ACCOUNT_ID}`),
      itemContext,
    );

    expect(response.status).toBe(400);
    expect(mocks.updateHostMachineAccount).not.toHaveBeenCalled();
  });

  it("maps store results to 404 and 400", async () => {
    const patch = () =>
      PATCH(
        jsonRequest("PATCH", { repositoryIds: [REPO_A] }, `${BASE}/${ACCOUNT_ID}`),
        itemContext,
      );

    mocks.updateHostMachineAccount.mockResolvedValue({ ok: false, error: "not_found" });
    expect((await patch()).status).toBe(404);
    mocks.updateHostMachineAccount.mockResolvedValue({
      ok: false,
      error: "not_host_account",
    });
    expect((await patch()).status).toBe(400);
    mocks.updateHostMachineAccount.mockResolvedValue({
      ok: false,
      error: "repository_not_found",
    });
    expect((await patch()).status).toBe(400);
  });

  it("returns 404 when there is nothing to delete", async () => {
    mocks.deleteMachineAccountAsAdmin.mockResolvedValue(false);

    const response = await DELETE(
      new NextRequest(`${BASE}/${ACCOUNT_ID}`, { method: "DELETE" }),
      itemContext,
    );

    expect(response.status).toBe(404);
    expect(mocks.deleteMachineAccountAsAdmin).toHaveBeenCalledWith(
      { id: "user-1" },
      ACCOUNT_ID,
      expect.anything(),
    );
  });
});

describe("machine account repository list schema", () => {
  it("cascades with the account and with the repository", () => {
    const { foreignKeys } = getTableConfig(machineAccountRepositories);
    const actions = Object.fromEntries(
      foreignKeys.map((fk) => [fk.reference().columns[0]!.name, fk.onDelete]),
    );

    expect(actions).toEqual({
      machine_account_id: "cascade",
      repository_id: "cascade",
    });
  });
});
