// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  bulkDeleteTags: vi.fn(),
  requireDeleteAccess: vi.fn(),
}));

vi.mock("@/lib/registry/delete/access", () => ({
  requireDeleteAccess: mocks.requireDeleteAccess,
}));

vi.mock("@/lib/registry/delete/service", () => ({
  bulkDeleteTags: mocks.bulkDeleteTags,
  deleteImage: vi.fn(),
  deleteManifestDigest: vi.fn(),
  deleteTag: vi.fn(),
}));

vi.mock("@/lib/registry/client/catalog", () => ({
  listRepositoryCatalog: vi.fn(),
}));

vi.mock("@/lib/registry/client/tags", () => ({
  getTagDetail: vi.fn(),
  getTagSiblings: vi.fn(),
  listImageTags: vi.fn(),
}));

vi.mock("@/lib/registry/catalog/access", () => ({
  handleRegistryRouteError: vi.fn(),
  joinImageName: (segments: string[]) => segments.join("/"),
  requireRepositoryAccess: vi.fn(),
}));

vi.mock("@/lib/pulls/stats", () => ({
  getTagPullCounts: vi.fn(),
  pullCountKeysForTags: vi.fn(),
  resolveTagPullCount: vi.fn(),
}));

vi.mock("@/lib/repositories/settings", () => ({
  getImageSettings: vi.fn(),
  upsertImageSettings: vi.fn(),
}));

vi.mock("@/lib/session/request", () => ({
  getSessionUserFromRequest: vi.fn(),
}));

import { POST } from "@/app/api/repositories/[id]/images/[...path]/route";

function bulkDeleteRequest(body: unknown): NextRequest {
  return new NextRequest(
    "http://localhost/api/repositories/repo-1/images/hello/tags/bulk-delete",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

function post(body: unknown) {
  return POST(bulkDeleteRequest(body), {
    params: Promise.resolve({
      id: "repo-1",
      path: ["hello", "tags", "bulk-delete"],
    }),
  });
}

describe("bulk-delete route validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireDeleteAccess.mockResolvedValue({
      user: { id: "user-1", email: "dev@localhost", systemRole: "admin" },
      repository: { id: "repo-1", name: "demo", role: "admin" },
    });
    mocks.bulkDeleteTags.mockResolvedValue({
      deletedTags: [],
      deletedDigests: [],
    });
  });

  it.each([
    ["mixed string and object name", ["a", { name: { name: "b" } }]],
    ["empty object", [{}]],
    ["null entry", [null]],
    ["number entry", [1]],
    ["array entry", [["a"]]],
    ["non-boolean isUntagged", [{ name: "a", isUntagged: "yes" }]],
    ["valid entry followed by an invalid one", [{ name: "a" }, 2]],
  ])("rejects %s with 400 and deletes nothing", async (_label, tags) => {
    const response = await post({ tags });

    expect(response.status).toBe(400);
    expect(mocks.bulkDeleteTags).not.toHaveBeenCalled();
  });

  it.each([
    ["null", null],
    ["an array", ["a"]],
    ["a string", "a"],
    ["a number", 1],
    ["a boolean", true],
  ])("rejects a %s body with 400 and deletes nothing", async (_label, body) => {
    const response = await post(body);

    expect(response.status).toBe(400);
    expect(mocks.bulkDeleteTags).not.toHaveBeenCalled();
  });

  it("passes strings and objects through as normalized items", async () => {
    const response = await post({
      tags: ["dev", { name: "sha256:abc", isUntagged: true }, { name: "v1" }],
    });

    expect(response.status).toBe(200);
    expect(mocks.bulkDeleteTags).toHaveBeenCalledWith(
      expect.anything(),
      "demo",
      "hello",
      [
        { name: "dev" },
        { name: "sha256:abc", isUntagged: true },
        { name: "v1" },
      ],
    );
  });
});
