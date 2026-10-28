// Copyright (c) 2026 Michael David Guggenbichler (MDG Labs), licensed under Apache-2.0 — see LICENSE

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/admin/machine-accounts/route";

const mocks = vi.hoisted(() => ({
  getSessionUserFromRequest: vi.fn(),
  listAllMachineAccounts: vi.fn(),
}));

vi.mock("@/lib/session/request", () => ({
  getSessionUserFromRequest: mocks.getSessionUserFromRequest,
}));

vi.mock("@/lib/machine-accounts/store", () => ({
  listAllMachineAccounts: mocks.listAllMachineAccounts,
  createHostMachineAccount: vi.fn(),
}));

const BASE = "http://localhost/api/admin/machine-accounts";
const REPO_ID = "11111111-1111-4111-8111-111111111111";

const row = {
  id: "22222222-2222-4222-8222-222222222222",
  kind: "host",
  name: "deploy",
  status: "active",
};

function list(query = "") {
  return GET(new NextRequest(`${BASE}${query}`));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSessionUserFromRequest.mockResolvedValue({
    id: "admin-1",
    name: "Ada",
    email: "ada@example.com",
    systemRole: "admin",
  });
  mocks.listAllMachineAccounts.mockResolvedValue([row]);
});

describe("GET /api/admin/machine-accounts filters", () => {
  it("answers 401 without a session and 403 for a non-admin, before reading", async () => {
    mocks.getSessionUserFromRequest.mockResolvedValueOnce(null);
    expect((await list("?status=active")).status).toBe(401);

    mocks.getSessionUserFromRequest.mockResolvedValueOnce({
      id: "user-1",
      name: "Bob",
      email: "bob@example.com",
      systemRole: "user",
    });
    expect((await list("?status=active")).status).toBe(403);

    expect(mocks.listAllMachineAccounts).not.toHaveBeenCalled();
  });

  it("lists without filters when none are given", async () => {
    const response = await list();

    expect(response.status).toBe(200);
    expect(mocks.listAllMachineAccounts).toHaveBeenCalledWith({});
    expect(await response.json()).toEqual({ machineAccounts: [row] });
  });

  it("passes kind, repositoryId and status to the store", async () => {
    const response = await list(
      `?kind=host&repositoryId=${REPO_ID.toUpperCase()}&status=expired`,
    );

    expect(response.status).toBe(200);
    expect(mocks.listAllMachineAccounts).toHaveBeenCalledWith({
      kind: "host",
      repositoryId: REPO_ID,
      status: "expired",
    });
  });

  it.each([
    "?kind=robot",
    "?status=revoked",
    "?repositoryId=not-a-uuid",
    "?kind=",
  ])("rejects %s with 400 and never queries", async (query) => {
    const response = await list(query);

    expect(response.status).toBe(400);
    expect(mocks.listAllMachineAccounts).not.toHaveBeenCalled();
  });
});
