// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteManifestReference: vi.fn(),
  getManifestDigest: vi.fn(),
  issueUserRegistryDeleteToken: vi.fn(),
  writeAuditLog: vi.fn(),
  getRepositoryByName: vi.fn(),
}));

vi.mock("@/lib/registry/client/delete-token", () => ({
  issueUserRegistryDeleteToken: mocks.issueUserRegistryDeleteToken,
}));

vi.mock("@/lib/registry/client/manifest", () => ({
  deleteManifestReference: mocks.deleteManifestReference,
  getManifestDigest: mocks.getManifestDigest,
}));

vi.mock("@/lib/audit/log", () => ({
  writeAuditLog: mocks.writeAuditLog,
}));

vi.mock("@/lib/rbac/roles", () => ({
  getRepositoryByName: mocks.getRepositoryByName,
}));

vi.mock("@/lib/registry/client/tags", () => ({
  getTagSiblings: vi.fn(),
}));

import { bulkDeleteTags } from "@/lib/registry/delete/service";

const user = {
  id: "user-1",
  email: "dev@localhost",
  systemRole: "user" as const,
};

describe("bulkDeleteTags with untagged digests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.issueUserRegistryDeleteToken.mockResolvedValue("token");
    mocks.getRepositoryByName.mockResolvedValue({ id: "repo-1" });
    mocks.getManifestDigest.mockResolvedValue({
      digest: "sha256:taggeddigest",
      size: 100,
    });
  });

  it("deletes tagged references by tag name", async () => {
    const result = await bulkDeleteTags(user, "demo", "hello", [
      { name: "dev" },
    ]);

    expect(mocks.deleteManifestReference).toHaveBeenCalledWith(
      "demo/hello",
      "dev",
      "token",
    );
    expect(result.deletedTags).toEqual(["dev"]);
    expect(result.deletedDigests).toEqual(["sha256:taggeddigest"]);
  });

  it("deletes untagged manifests by digest", async () => {
    const digest =
      "sha256:1111222233334444555566667777888899990000aaaabbbbccccddddeeee";

    const result = await bulkDeleteTags(user, "demo", "hello", [
      { name: digest, isUntagged: true },
    ]);

    expect(mocks.deleteManifestReference).toHaveBeenCalledWith(
      "demo/hello",
      digest,
      "token",
    );
    expect(result.deletedTags).toEqual([]);
    expect(result.deletedDigests).toEqual([digest]);
  });
});
