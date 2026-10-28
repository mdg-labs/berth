// Copyright (c) 2026 Michael David Guggenbichler (MDG Labs), licensed under Apache-2.0 — see LICENSE

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/account/tokens/route";

const { getSessionUserFromRequestMock, createPersonalAccessTokenMock } =
  vi.hoisted(() => ({
    getSessionUserFromRequestMock: vi.fn(),
    createPersonalAccessTokenMock: vi.fn(),
  }));

vi.mock("@/lib/session/request", () => ({
  getSessionUserFromRequest: getSessionUserFromRequestMock,
}));

vi.mock("@/lib/pat/store", () => ({
  createPersonalAccessToken: createPersonalAccessTokenMock,
  listPersonalAccessTokens: vi.fn(),
}));

vi.mock("@/lib/pat/config", () => ({
  getPatPolicy: vi.fn(),
}));

vi.mock("@/lib/repositories/service", () => ({
  listRepositoriesForUser: vi.fn(),
}));

function createRequest(body: string) {
  return new NextRequest("http://localhost/api/account/tokens", {
    method: "POST",
    body,
  });
}

async function post(body: string) {
  const response = await POST(createRequest(body));
  if (!response) {
    throw new Error("route returned no response");
  }
  return response;
}

const validBody = {
  name: "ci",
  allowPull: true,
  allowPush: false,
  expiresAt: null,
  repositoryIds: null,
};

describe("POST /api/account/tokens body handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionUserFromRequestMock.mockResolvedValue({
      id: "user-1",
      email: "user@example.test",
      systemRole: "user",
    });
    createPersonalAccessTokenMock.mockResolvedValue({
      ok: true,
      token: "bt_secret",
      summary: { id: "pat-1" },
    });
  });

  it("rejects an unauthenticated caller before reading the body", async () => {
    getSessionUserFromRequestMock.mockResolvedValue(null);

    const response = await post(JSON.stringify(validBody));

    expect(response.status).toBe(401);
    expect(createPersonalAccessTokenMock).not.toHaveBeenCalled();
  });

  it("passes a valid body through unchanged", async () => {
    const response = await post(JSON.stringify(validBody));

    expect(response.status).toBe(200);
    expect(createPersonalAccessTokenMock).toHaveBeenCalledWith(
      { id: "user-1", email: "user@example.test", systemRole: "user" },
      validBody,
      expect.anything(),
    );
  });

  it("keeps a repository allowlist and an expiry", async () => {
    const body = {
      ...validBody,
      expiresAt: "2099-01-01T00:00:00.000Z",
      repositoryIds: ["repo-1", "repo-2"],
    };

    const response = await post(JSON.stringify(body));

    expect(response.status).toBe(200);
    expect(createPersonalAccessTokenMock).toHaveBeenCalledWith(
      expect.anything(),
      body,
      expect.anything(),
    );
  });

  it("keeps an empty repositoryIds list as sent", async () => {
    const body = { ...validBody, repositoryIds: [] };

    const response = await post(JSON.stringify(body));

    expect(response.status).toBe(200);
    expect(createPersonalAccessTokenMock).toHaveBeenCalledWith(
      expect.anything(),
      body,
      expect.anything(),
    );
  });

  it("treats absent expiresAt and repositoryIds as null", async () => {
    const response = await post(
      JSON.stringify({ name: "ci", allowPull: true, allowPush: true }),
    );

    expect(response.status).toBe(200);
    expect(createPersonalAccessTokenMock).toHaveBeenCalledWith(
      expect.anything(),
      {
        name: "ci",
        allowPull: true,
        allowPush: true,
        expiresAt: null,
        repositoryIds: null,
      },
      expect.anything(),
    );
  });

  it.each([
    ["malformed JSON", "{"],
    ["an empty body", ""],
    ["a null body", "null"],
    ["an array body", "[]"],
    ["a string body", '"name"'],
    ["a numeric body", "1"],
    ["a boolean body", "true"],
    ["a missing name", JSON.stringify({ ...validBody, name: undefined })],
    ["a numeric name", JSON.stringify({ ...validBody, name: 5 })],
    ["a null name", JSON.stringify({ ...validBody, name: null })],
    ["only allowPull", '{"allowPull":true}'],
    [
      "a missing allowPull",
      JSON.stringify({ ...validBody, allowPull: undefined }),
    ],
    ["a string allowPull", JSON.stringify({ ...validBody, allowPull: "true" })],
    ["a null allowPull", JSON.stringify({ ...validBody, allowPull: null })],
    [
      "a missing allowPush",
      JSON.stringify({ ...validBody, allowPush: undefined }),
    ],
    ["a numeric allowPush", JSON.stringify({ ...validBody, allowPush: 1 })],
    ["a numeric expiresAt", JSON.stringify({ ...validBody, expiresAt: 0 })],
    ["an object expiresAt", JSON.stringify({ ...validBody, expiresAt: {} })],
    [
      "an object repositoryIds",
      JSON.stringify({ ...validBody, repositoryIds: {} }),
    ],
    [
      "a string repositoryIds",
      JSON.stringify({ ...validBody, repositoryIds: "repo-1" }),
    ],
    [
      "a non-string repositoryIds entry",
      JSON.stringify({ ...validBody, repositoryIds: ["repo-1", 2] }),
    ],
    [
      "a null repositoryIds entry",
      JSON.stringify({ ...validBody, repositoryIds: [null] }),
    ],
  ])("rejects %s with 400 without creating a token", async (_label, body) => {
    const response = await post(body);

    expect(response.status).toBe(400);
    expect(
      ((await response.json()) as { error: { code: string } }).error.code,
    ).toBe("bad_request");
    expect(createPersonalAccessTokenMock).not.toHaveBeenCalled();
  });
});
