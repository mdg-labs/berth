// Copyright (c) 2026 Michael David Guggenbichler (MDG Labs), licensed under Apache-2.0 — see LICENSE

import { getTableConfig } from "drizzle-orm/pg-core";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DELETE } from "@/app/api/repositories/[id]/machine-accounts/[accountId]/route";
import {
  GET,
  POST,
} from "@/app/api/repositories/[id]/machine-accounts/route";
import { GET as tokenGET } from "@/app/api/auth/token/route";
import { requiresCsrfHeader } from "@/lib/csrf/check";
import { machineAccounts } from "@/lib/db/schema";
import { resetRateLimits } from "@/lib/rate-limit/login";

const mocks = vi.hoisted(() => ({
  getSessionUserFromRequest: vi.fn(),
  getRepositoryById: vi.fn(),
  getRepositoryMemberRole: vi.fn(),
  listMachineAccounts: vi.fn(),
  createMachineAccount: vi.fn(),
  deleteMachineAccount: vi.fn(),
  resolveMachineAccount: vi.fn(),
  findUserByEmail: vi.fn(),
}));

vi.mock("@/lib/session/request", () => ({
  getSessionUserFromRequest: mocks.getSessionUserFromRequest,
}));

vi.mock("@/lib/rbac/roles", () => ({
  getRepositoryById: mocks.getRepositoryById,
  getRepositoryMemberRole: mocks.getRepositoryMemberRole,
}));

vi.mock("@/lib/machine-accounts/store", () => ({
  listMachineAccounts: mocks.listMachineAccounts,
  createMachineAccount: mocks.createMachineAccount,
  deleteMachineAccount: mocks.deleteMachineAccount,
  resolveMachineAccount: mocks.resolveMachineAccount,
}));

vi.mock("@/lib/auth/credentials", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/credentials")>();
  return { ...actual, findUserByEmail: mocks.findUserByEmail };
});

const REPOSITORY_ID = "11111111-1111-4111-8111-111111111111";
const ACCOUNT_ID = "22222222-2222-4222-8222-222222222222";
const BASE = `http://localhost/api/repositories/${REPOSITORY_ID}/machine-accounts`;

const repository = { id: REPOSITORY_ID, name: "acme", isPublic: false };
const sessionUser = (systemRole: "admin" | "user") => ({
  id: "user-1",
  name: "Ada",
  email: "ada@example.com",
  systemRole,
});

const listContext = { params: Promise.resolve({ id: REPOSITORY_ID }) };
const itemContext = (accountId = ACCOUNT_ID) => ({
  params: Promise.resolve({ id: REPOSITORY_ID, accountId }),
});

function createRequest(body: unknown) {
  return new NextRequest(BASE, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const summary = {
  id: ACCOUNT_ID,
  name: "ci",
  description: null,
  username: "acme+ci",
  tokenPrefix: "bm_abcdefghi",
  allowPull: true,
  allowPush: false,
  createdBy: { id: "user-1", name: "Ada" },
  createdAt: "2026-01-01T00:00:00.000Z",
};

function allCalls() {
  return [
    () => GET(new NextRequest(BASE), listContext),
    () => POST(createRequest({ name: "ci", allowPull: true }), listContext),
    () =>
      DELETE(
        new NextRequest(`${BASE}/${ACCOUNT_ID}`, { method: "DELETE" }),
        itemContext(),
      ),
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSessionUserFromRequest.mockResolvedValue(sessionUser("user"));
  mocks.getRepositoryById.mockResolvedValue(repository);
  mocks.getRepositoryMemberRole.mockResolvedValue("admin");
  mocks.listMachineAccounts.mockResolvedValue([summary]);
  mocks.createMachineAccount.mockResolvedValue({
    ok: true,
    secret: "bm_secret",
    summary,
  });
  mocks.deleteMachineAccount.mockResolvedValue(true);
});

describe("machine account routes authorization", () => {
  it("rejects a request without a session with 401 before any lookup", async () => {
    mocks.getSessionUserFromRequest.mockResolvedValue(null);

    for (const call of allCalls()) {
      expect((await call()).status).toBe(401);
    }
    expect(mocks.getRepositoryById).not.toHaveBeenCalled();
    expect(mocks.listMachineAccounts).not.toHaveBeenCalled();
    expect(mocks.createMachineAccount).not.toHaveBeenCalled();
    expect(mocks.deleteMachineAccount).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown repository", async () => {
    mocks.getRepositoryById.mockResolvedValue(null);

    for (const call of allCalls()) {
      expect((await call()).status).toBe(404);
    }
    expect(mocks.createMachineAccount).not.toHaveBeenCalled();
    expect(mocks.deleteMachineAccount).not.toHaveBeenCalled();
  });

  it("returns 404 for a repository id that is not a uuid without a lookup", async () => {
    const response = await GET(new NextRequest(BASE), {
      params: Promise.resolve({ id: "not-a-uuid" }),
    });

    expect(response.status).toBe(404);
    expect(mocks.getRepositoryById).not.toHaveBeenCalled();
  });

  it.each(["maintainer", "developer", "guest", null])(
    "returns 403 for a repository member with role %s",
    async (role) => {
      mocks.getRepositoryMemberRole.mockResolvedValue(role);

      for (const call of allCalls()) {
        expect((await call()).status).toBe(403);
      }
      expect(mocks.listMachineAccounts).not.toHaveBeenCalled();
      expect(mocks.createMachineAccount).not.toHaveBeenCalled();
      expect(mocks.deleteMachineAccount).not.toHaveBeenCalled();
    },
  );

  it("allows a repository admin", async () => {
    for (const call of allCalls()) {
      expect((await call()).status).toBeLessThan(300);
    }
  });

  it("allows a system admin who is not a member", async () => {
    mocks.getSessionUserFromRequest.mockResolvedValue(sessionUser("admin"));
    mocks.getRepositoryMemberRole.mockResolvedValue(null);

    for (const call of allCalls()) {
      expect((await call()).status).toBeLessThan(300);
    }
  });

  it("looks the role up again on every request", async () => {
    await GET(new NextRequest(BASE), listContext);
    mocks.getRepositoryMemberRole.mockResolvedValue("maintainer");
    const second = await GET(new NextRequest(BASE), listContext);

    expect(second.status).toBe(403);
    expect(mocks.getRepositoryMemberRole).toHaveBeenCalledTimes(2);
  });

  it("keeps the routes under the middleware CSRF check", () => {
    expect(requiresCsrfHeader("POST", new URL(BASE).pathname)).toBe(true);
    expect(
      requiresCsrfHeader("DELETE", new URL(`${BASE}/${ACCOUNT_ID}`).pathname),
    ).toBe(true);
  });
});

describe("POST machine-accounts", () => {
  it("returns the summary and the secret once", async () => {
    const response = await POST(
      createRequest({ name: "CI", description: " nightly ", allowPull: true }),
      listContext,
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      machineAccount: summary,
      secret: "bm_secret",
    });
    expect(mocks.createMachineAccount).toHaveBeenCalledWith(
      { id: "user-1", name: "Ada" },
      repository,
      { name: "ci", description: "nightly", allowPull: true, allowPush: false },
      expect.anything(),
    );
  });

  it.each([
    ["malformed JSON", "{"],
    ["a non-object body", "[]"],
    ["a missing name", { allowPull: true }],
    ["a non-string name", { name: 7, allowPull: true }],
    ["a name that is not a slug", { name: "bad name", allowPull: true }],
    ["a one character name", { name: "a", allowPull: true }],
    ["a name with the display separator", { name: "a+b", allowPull: true }],
    ["no permission", { name: "ci" }],
    ["both permissions false", { name: "ci", allowPull: false, allowPush: false }],
    ["a string permission", { name: "ci", allowPull: "true" }],
    ["a non-string description", { name: "ci", allowPull: true, description: 1 }],
    [
      "an over-long description",
      { name: "ci", allowPull: true, description: "x".repeat(256) },
    ],
  ])("returns 400 for %s", async (_label, body) => {
    const response = await POST(createRequest(body), listContext);

    expect(response.status).toBe(400);
    expect(mocks.createMachineAccount).not.toHaveBeenCalled();
  });

  it("returns 409 conflict for a duplicate name", async () => {
    mocks.createMachineAccount.mockResolvedValue({
      ok: false,
      error: "duplicate_name",
    });

    const response = await POST(
      createRequest({ name: "ci", allowPull: true }),
      listContext,
    );

    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("conflict");
  });

  it("returns 404 when the repository vanished before the insert", async () => {
    mocks.createMachineAccount.mockResolvedValue({
      ok: false,
      error: "repository_not_found",
    });

    const response = await POST(
      createRequest({ name: "ci", allowPull: true }),
      listContext,
    );

    expect(response.status).toBe(404);
  });
});

describe("GET and DELETE machine-accounts", () => {
  it("lists summaries without a secret", async () => {
    const response = await GET(new NextRequest(BASE), listContext);

    expect(response.status).toBe(200);
    const text = JSON.stringify(await response.json());
    expect(text).not.toContain("secret");
    expect(text).not.toContain("tokenHash");
    expect(mocks.listMachineAccounts).toHaveBeenCalledWith(REPOSITORY_ID);
  });

  it("returns 404 when the account is not in this repository", async () => {
    mocks.deleteMachineAccount.mockResolvedValue(false);

    const response = await DELETE(
      new NextRequest(`${BASE}/${ACCOUNT_ID}`, { method: "DELETE" }),
      itemContext(),
    );

    expect(response.status).toBe(404);
    expect(mocks.deleteMachineAccount).toHaveBeenCalledWith(
      { id: "user-1" },
      REPOSITORY_ID,
      ACCOUNT_ID,
      expect.anything(),
    );
  });
});

describe("machine account schema", () => {
  it("cascades with the owner repository and keeps the account when its creator is deleted", () => {
    const { foreignKeys } = getTableConfig(machineAccounts);
    const actions = Object.fromEntries(
      foreignKeys.map((fk) => {
        const ref = fk.reference();
        return [ref.columns[0]!.name, fk.onDelete];
      }),
    );

    expect(actions).toEqual({
      owner_repository_id: "cascade",
      created_by: "set null",
    });
  });
});

describe("GET /api/auth/token with a machine account secret", () => {
  beforeEach(() => {
    resetRateLimits();
    mocks.findUserByEmail.mockResolvedValue(null);
    mocks.resolveMachineAccount.mockResolvedValue(null);
  });

  it("resolves an unknown secret as a machine account only and answers 401", async () => {
    const basic = Buffer.from("acme+ci:bm_secret").toString("base64");

    const response = await tokenGET(
      new NextRequest("http://localhost/api/auth/token?service=registry", {
        headers: { authorization: `Basic ${basic}` },
      }),
    );

    expect(response.status).toBe(401);
    expect(mocks.resolveMachineAccount).toHaveBeenCalledWith("bm_secret");
    expect(mocks.findUserByEmail).not.toHaveBeenCalled();
  });
});
