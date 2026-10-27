// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getManifestDigest: vi.fn(),
  fetchAllTagNames: vi.fn(),
  listUntaggedDigests: vi.fn(),
}));

vi.mock("@/lib/registry/client/auth", () => ({
  issueUserRegistryToken: vi.fn().mockResolvedValue("token"),
}));

vi.mock("@/lib/registry/client/manifest", () => ({
  getManifestDigest: mocks.getManifestDigest,
  resolveManifest: vi.fn(),
}));

vi.mock("@/lib/registry/client/tag-names", () => ({
  fetchAllTagNames: mocks.fetchAllTagNames,
}));

vi.mock("@/lib/registry/storage/untagged-digests", () => ({
  isRegistryStorageReadable: vi.fn().mockResolvedValue(true),
  listUntaggedDigests: mocks.listUntaggedDigests,
}));

import { listImageTags } from "@/lib/registry/client/tags";

const user = {
  id: "user-1",
  email: "dev@localhost",
  systemRole: "user" as const,
};

function trackInFlight() {
  let inFlight = 0;
  let maxInFlight = 0;

  mocks.getManifestDigest.mockImplementation(
    async (_fullName: string, reference: string) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 3));
      inFlight -= 1;
      return { digest: `sha256:${reference}`, size: reference.length };
    },
  );

  return () => maxInFlight;
}

describe("listImageTags manifest lookups", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listUntaggedDigests.mockResolvedValue([]);
  });

  it("bounds concurrent tag manifest lookups and keeps every tag", async () => {
    const tagNames = Array.from({ length: 40 }, (_, i) => `t${i}`);
    mocks.fetchAllTagNames.mockResolvedValue(tagNames);
    const maxInFlight = trackInFlight();

    const result = await listImageTags(user, "demo", "hello", {
      pageSize: 100,
      sort: "name",
    });

    expect(mocks.getManifestDigest).toHaveBeenCalledTimes(40);
    expect(maxInFlight()).toBeGreaterThan(1);
    expect(maxInFlight()).toBeLessThanOrEqual(8);
    expect(result.total).toBe(40);
    for (const tag of result.tags) {
      expect(tag.digest).toBe(`sha256:${tag.name}`);
    }
  });

  it("keeps tag order for sibling lists when lookups finish out of order", async () => {
    const tagNames = Array.from({ length: 20 }, (_, i) => `t${i}`);
    mocks.fetchAllTagNames.mockResolvedValue(tagNames);
    mocks.getManifestDigest.mockImplementation(
      async (_fullName: string, reference: string) => {
        const index = Number(reference.slice(1));
        await new Promise((resolve) => setTimeout(resolve, (20 - index) % 7));
        return { digest: "sha256:same", size: 1 };
      },
    );

    const result = await listImageTags(user, "demo", "hello", {
      pageSize: 100,
      sort: "name",
    });

    const first = result.tags.find((tag) => tag.name === "t0");
    expect(first?.siblings).toEqual(tagNames.slice(1));
  });

  it("resolves untagged digests through the same bound and keeps order", async () => {
    const digests = Array.from({ length: 30 }, (_, i) => `sha256:u${i}`);
    mocks.fetchAllTagNames.mockResolvedValue([]);
    mocks.listUntaggedDigests.mockResolvedValue(digests);
    const maxInFlight = trackInFlight();

    const result = await listImageTags(user, "demo", "hello", {
      includeUntagged: true,
      pageSize: 100,
      sort: "name",
    });

    expect(maxInFlight()).toBeGreaterThan(1);
    expect(maxInFlight()).toBeLessThanOrEqual(8);
    expect(result.tags.map((tag) => tag.name)).toEqual(
      [...digests].sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true }),
      ),
    );
  });

  it("skips digests that no longer resolve", async () => {
    mocks.fetchAllTagNames.mockResolvedValue([]);
    mocks.listUntaggedDigests.mockResolvedValue(["sha256:a", "sha256:b"]);
    mocks.getManifestDigest.mockImplementation(
      async (_fullName: string, reference: string) =>
        reference === "sha256:a" ? null : { digest: reference, size: 1 },
    );

    const result = await listImageTags(user, "demo", "hello", {
      includeUntagged: true,
    });

    expect(result.tags.map((tag) => tag.name)).toEqual(["sha256:b"]);
  });

  it("propagates a failed lookup", async () => {
    mocks.fetchAllTagNames.mockResolvedValue(["a", "b", "c"]);
    mocks.getManifestDigest.mockRejectedValue(new Error("registry down"));

    await expect(listImageTags(user, "demo", "hello")).rejects.toThrow(
      "registry down",
    );
  });
});
