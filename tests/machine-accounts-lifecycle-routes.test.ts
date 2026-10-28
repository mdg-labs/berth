// Copyright (c) 2026 Michael David Guggenbichler (MDG Labs), licensed under Apache-2.0 — see LICENSE

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PATCH as adminPATCH } from "@/app/api/admin/machine-accounts/[accountId]/route";
import { POST as adminRotatePOST } from "@/app/api/admin/machine-accounts/[accountId]/rotate/route";
import { PATCH as repoPATCH } from "@/app/api/repositories/[id]/machine-accounts/[accountId]/route";
import { POST as repoRotatePOST } from "@/app/api/repositories/[id]/machine-accounts/[accountId]/rotate/route";
import { requiresCsrfHeader } from "@/lib/csrf/check";
import {
  parseHostMachineAccountInput,
  parseHostMachineAccountUpdate,
  parseMachineAccountInput,
  parseMachineAccountUpdate,
  parseRotateMachineAccountBody,
} from "@/lib/machine-accounts/validation";

const mocks = vi.hoisted(() => ({
  getSessionUserFromRequest: vi.fn(),
  getRepositoryById: vi.fn(),
  getRepositoryMemberRole: vi.fn(),
  updateMachineAccount: vi.fn(),
  updateHostMachineAccount: vi.fn(),
  rotateMachineAccount: vi.fn(),
}));

vi.mock("@/lib/session/request", () => ({
  getSessionUserFromRequest: mocks.getSessionUserFromRequest,
}));

vi.mock("@/lib/rbac/roles", () => ({
  getRepositoryById: mocks.getRepositoryById,
  getRepositoryMemberRole: mocks.getRepositoryMemberRole,
}));

vi.mock("@/lib/machine-accounts/store", () => ({
  updateMachineAccount: mocks.updateMachineAccount,
  updateHostMachineAccount: mocks.updateHostMachineAccount,
  rotateMachineAccount: mocks.rotateMachineAccount,
  deleteMachineAccount: vi.fn(),
  deleteMachineAccountAsAdmin: vi.fn(),
}));

const REPOSITORY_ID = "11111111-1111-4111-8111-111111111111";
const ACCOUNT_ID = "22222222-2222-4222-8222-222222222222";
const REPO_BASE = `http://localhost/api/repositories/${REPOSITORY_ID}/machine-accounts`;
const ADMIN_BASE = "http://localhost/api/admin/machine-accounts";

const sessionUser = (systemRole: "admin" | "user") => ({
  id: "user-1",
  name: "Ada",
  email: "ada@example.com",
  systemRole,
});

const repoContext = {
  params: Promise.resolve({ id: REPOSITORY_ID, accountId: ACCOUNT_ID }),
};
const adminContext = { params: Promise.resolve({ accountId: ACCOUNT_ID }) };

function request(method: string, url: string, body?: unknown) {
  return new NextRequest(url, {
    method,
    headers: { "content-type": "application/json" },
    body:
      body === undefined
        ? undefined
        : typeof body === "string"
          ? body
          : JSON.stringify(body),
  });
}

const summary = { id: ACCOUNT_ID, name: "ci", disabledAt: null, expiresAt: null };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSessionUserFromRequest.mockResolvedValue(sessionUser("user"));
  mocks.getRepositoryById.mockResolvedValue({
    id: REPOSITORY_ID,
    name: "acme",
    isPublic: false,
  });
  mocks.getRepositoryMemberRole.mockResolvedValue("admin");
  mocks.updateMachineAccount.mockResolvedValue({ ok: true, summary });
  mocks.updateHostMachineAccount.mockResolvedValue({ ok: true, summary });
  mocks.rotateMachineAccount.mockResolvedValue({
    ok: true,
    secret: "bm_new",
    summary,
  });
});

function repoCalls() {
  return [
    () =>
      repoPATCH(
        request("PATCH", `${REPO_BASE}/${ACCOUNT_ID}`, { disabled: true }),
        repoContext,
      ),
    () =>
      repoRotatePOST(
        request("POST", `${REPO_BASE}/${ACCOUNT_ID}/rotate`, {}),
        repoContext,
      ),
  ];
}

function adminCalls() {
  return [
    () =>
      adminPATCH(
        request("PATCH", `${ADMIN_BASE}/${ACCOUNT_ID}`, { disabled: true }),
        adminContext,
      ),
    () =>
      adminRotatePOST(
        request("POST", `${ADMIN_BASE}/${ACCOUNT_ID}/rotate`, {}),
        adminContext,
      ),
  ];
}

function expectNoStoreCalls() {
  expect(mocks.updateMachineAccount).not.toHaveBeenCalled();
  expect(mocks.updateHostMachineAccount).not.toHaveBeenCalled();
  expect(mocks.rotateMachineAccount).not.toHaveBeenCalled();
}

describe("repository lifecycle routes", () => {
  it("answers 401 without a session", async () => {
    mocks.getSessionUserFromRequest.mockResolvedValue(null);
    for (const call of repoCalls()) {
      expect((await call()).status).toBe(401);
    }
    expectNoStoreCalls();
  });

  it("answers 403 for a repository maintainer and 404 for an unknown repository", async () => {
    mocks.getRepositoryMemberRole.mockResolvedValue("maintainer");
    for (const call of repoCalls()) {
      expect((await call()).status).toBe(403);
    }
    mocks.getRepositoryById.mockResolvedValue(null);
    for (const call of repoCalls()) {
      expect((await call()).status).toBe(404);
    }
    expectNoStoreCalls();
  });

  it("scopes both operations to the repository from the path", async () => {
    for (const call of repoCalls()) {
      expect((await call()).status).toBe(200);
    }
    expect(mocks.updateMachineAccount).toHaveBeenCalledWith(
      { id: "user-1" },
      REPOSITORY_ID,
      ACCOUNT_ID,
      { disabled: true },
      expect.anything(),
    );
    expect(mocks.rotateMachineAccount).toHaveBeenCalledWith(
      { id: "user-1" },
      { repositoryId: REPOSITORY_ID },
      ACCOUNT_ID,
      {},
      expect.anything(),
    );
  });

  it("answers 404 when the store does not find the account in this repository", async () => {
    mocks.updateMachineAccount.mockResolvedValue({ ok: false, error: "not_found" });
    mocks.rotateMachineAccount.mockResolvedValue({ ok: false, error: "not_found" });
    for (const call of repoCalls()) {
      expect((await call()).status).toBe(404);
    }
  });

  it("returns the rotated secret once with no-store", async () => {
    const response = await repoRotatePOST(
      request("POST", `${REPO_BASE}/${ACCOUNT_ID}/rotate`),
      repoContext,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ machineAccount: summary, secret: "bm_new" });
  });

  it.each([
    ["malformed JSON", "{"],
    ["an array", "[]"],
    ["null", "null"],
    ["a string", '"x"'],
    ["a non-boolean resetExpiry", { resetExpiry: "yes" }],
    ["a non-string expiresAt", { expiresAt: 5 }],
    ["both resetExpiry and expiresAt", { resetExpiry: true, expiresAt: null }],
  ])("rejects a rotate body of %s with 400 and rotates nothing", async (_label, body) => {
    const response = await repoRotatePOST(
      request("POST", `${REPO_BASE}/${ACCOUNT_ID}/rotate`, body),
      repoContext,
    );
    expect(response.status).toBe(400);
    expect(mocks.rotateMachineAccount).not.toHaveBeenCalled();
  });

  it.each([
    ["malformed JSON", "{"],
    ["an array", "[]"],
    ["an empty object", {}],
    ["a non-boolean disabled", { disabled: 1 }],
    ["a non-string description", { description: 4 }],
  ])("rejects a patch body of %s with 400", async (_label, body) => {
    const response = await repoPATCH(
      request("PATCH", `${REPO_BASE}/${ACCOUNT_ID}`, body),
      repoContext,
    );
    expect(response.status).toBe(400);
    expect(mocks.updateMachineAccount).not.toHaveBeenCalled();
  });

  it.each([
    ["token_expired", 400],
    ["never_expire_not_allowed", 400],
    ["expiry_in_past", 400],
    ["expiry_exceeds_max", 400],
  ])("maps the store error %s to %i", async (error, status) => {
    mocks.rotateMachineAccount.mockResolvedValue({ ok: false, error });
    const response = await repoRotatePOST(
      request("POST", `${REPO_BASE}/${ACCOUNT_ID}/rotate`, {}),
      repoContext,
    );
    expect(response.status).toBe(status);
  });

  it("keeps both routes under the middleware CSRF check", () => {
    expect(requiresCsrfHeader("PATCH", `/api/repositories/${REPOSITORY_ID}/machine-accounts/${ACCOUNT_ID}`)).toBe(true);
    expect(requiresCsrfHeader("POST", `/api/repositories/${REPOSITORY_ID}/machine-accounts/${ACCOUNT_ID}/rotate`)).toBe(true);
  });
});

describe("admin lifecycle routes", () => {
  it("answers 401 without a session and 403 for a non-admin", async () => {
    mocks.getSessionUserFromRequest.mockResolvedValue(null);
    for (const call of adminCalls()) {
      expect((await call()).status).toBe(401);
    }
    mocks.getSessionUserFromRequest.mockResolvedValue(sessionUser("user"));
    for (const call of adminCalls()) {
      expect((await call()).status).toBe(403);
    }
    expectNoStoreCalls();
  });

  it("rotates without a repository scope and passes disabled through", async () => {
    mocks.getSessionUserFromRequest.mockResolvedValue(sessionUser("admin"));
    for (const call of adminCalls()) {
      expect((await call()).status).toBe(200);
    }
    expect(mocks.rotateMachineAccount).toHaveBeenCalledWith(
      { id: "user-1" },
      null,
      ACCOUNT_ID,
      {},
      expect.anything(),
    );
    expect(mocks.updateHostMachineAccount).toHaveBeenCalledWith(
      { id: "user-1" },
      ACCOUNT_ID,
      { disabled: true },
      expect.anything(),
    );
  });

  it("rejects a non-object rotate body", async () => {
    mocks.getSessionUserFromRequest.mockResolvedValue(sessionUser("admin"));
    const response = await adminRotatePOST(
      request("POST", `${ADMIN_BASE}/${ACCOUNT_ID}/rotate`, "[]"),
      adminContext,
    );
    expect(response.status).toBe(400);
    expect(mocks.rotateMachineAccount).not.toHaveBeenCalled();
  });

  it("keeps the rotate route under the middleware CSRF check", () => {
    expect(requiresCsrfHeader("POST", `/api/admin/machine-accounts/${ACCOUNT_ID}/rotate`)).toBe(true);
  });
});

describe("lifecycle body parsing", () => {
  it("treats a missing expiresAt as no expiry and rejects a wrong type on create", () => {
    expect(parseMachineAccountInput({ name: "ci", allowPull: true })).toMatchObject({
      ok: true,
      input: { expiresAt: null },
    });
    expect(
      parseMachineAccountInput({ name: "ci", allowPull: true, expiresAt: "2030-01-01T00:00:00Z" }),
    ).toMatchObject({ ok: true, input: { expiresAt: "2030-01-01T00:00:00Z" } });
    for (const expiresAt of [5, "", true, {}]) {
      expect(parseMachineAccountInput({ name: "ci", allowPull: true, expiresAt })).toEqual({
        ok: false,
        error: "invalid_expiry",
      });
      expect(
        parseHostMachineAccountInput({ name: "ci", repositoryIds: [ACCOUNT_ID], expiresAt }),
      ).toEqual({ ok: false, error: "invalid_expiry" });
    }
  });

  it("distinguishes keeping, resetting and replacing the expiry on rotate", () => {
    expect(parseRotateMachineAccountBody("")).toEqual({ ok: true, input: {} });
    expect(parseRotateMachineAccountBody('{"resetExpiry":true}')).toEqual({
      ok: true,
      input: { resetExpiry: true },
    });
    expect(parseRotateMachineAccountBody('{"expiresAt":null}')).toEqual({
      ok: true,
      input: { expiresAt: null },
    });
    expect(parseRotateMachineAccountBody('{"resetExpiry":false,"expiresAt":"2030-01-01"}')).toEqual({
      ok: true,
      input: { resetExpiry: false, expiresAt: "2030-01-01" },
    });
  });

  it("requires at least one field on update", () => {
    expect(parseMachineAccountUpdate({})).toEqual({ ok: false, error: "empty_update" });
    expect(parseHostMachineAccountUpdate({})).toEqual({ ok: false, error: "empty_update" });
    expect(parseHostMachineAccountUpdate({ disabled: false })).toEqual({
      ok: true,
      input: { disabled: false },
    });
  });
});
