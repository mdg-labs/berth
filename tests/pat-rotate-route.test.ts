// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/account/tokens/[id]/rotate/route";

const { getSessionUserFromRequestMock, rotatePersonalAccessTokenMock } =
  vi.hoisted(() => ({
    getSessionUserFromRequestMock: vi.fn(),
    rotatePersonalAccessTokenMock: vi.fn(),
  }));

vi.mock("@/lib/session/request", () => ({
  getSessionUserFromRequest: getSessionUserFromRequestMock,
}));

vi.mock("@/lib/pat/store", () => ({
  rotatePersonalAccessToken: rotatePersonalAccessTokenMock,
}));

function rotateRequest(body?: string) {
  return new NextRequest("http://localhost/api/account/tokens/pat-1/rotate", {
    method: "POST",
    body,
  });
}

const context = { params: Promise.resolve({ id: "pat-1" }) };

describe("POST /api/account/tokens/[id]/rotate body handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionUserFromRequestMock.mockResolvedValue({ id: "user-1" });
    rotatePersonalAccessTokenMock.mockResolvedValue({
      ok: true,
      token: "bt_secret",
      summary: { id: "pat-1" },
    });
  });

  it("rejects an unauthenticated caller before reading the body", async () => {
    getSessionUserFromRequestMock.mockResolvedValue(null);

    const response = await POST(rotateRequest("{}"), context);

    expect(response.status).toBe(401);
    expect(rotatePersonalAccessTokenMock).not.toHaveBeenCalled();
  });

  it("treats an empty body as no options", async () => {
    const response = await POST(rotateRequest(), context);

    expect(response.status).toBe(200);
    expect(rotatePersonalAccessTokenMock).toHaveBeenCalledWith(
      "user-1",
      "pat-1",
      {},
      expect.anything(),
    );
  });

  it("treats a whitespace-only body as no options", async () => {
    const response = await POST(rotateRequest("  \n"), context);

    expect(response.status).toBe(200);
    expect(rotatePersonalAccessTokenMock).toHaveBeenCalledTimes(1);
  });

  it("passes a boolean resetExpiry through", async () => {
    const response = await POST(rotateRequest('{"resetExpiry":false}'), context);

    expect(response.status).toBe(200);
    expect(rotatePersonalAccessTokenMock).toHaveBeenCalledWith(
      "user-1",
      "pat-1",
      { resetExpiry: false },
      expect.anything(),
    );
  });

  it.each([
    ["a string resetExpiry", '{"resetExpiry":"false"}'],
    ["a numeric resetExpiry", '{"resetExpiry":0}'],
    ["a null resetExpiry", '{"resetExpiry":null}'],
    ["an array body", "[]"],
    ["a null body", "null"],
    ["a primitive body", "true"],
    ["malformed JSON", "{"],
  ])("rejects %s without rotating", async (_label, body) => {
    const response = await POST(rotateRequest(body), context);

    expect(response.status).toBe(400);
    expect(rotatePersonalAccessTokenMock).not.toHaveBeenCalled();
  });
});
