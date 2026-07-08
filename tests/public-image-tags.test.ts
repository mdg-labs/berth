// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { enrichImagesWithVisibility } from "@/lib/images/settings";
import {
  getPublicImageTags,
  resolveRecommendedPullTag,
} from "@/lib/public/image-tags";
import { getImagePullCounts } from "@/lib/pulls/stats";
import { issueUserRegistryToken } from "@/lib/registry/client/auth";
import { listRepositoryCatalog } from "@/lib/registry/client/catalog";
import { resolveManifest } from "@/lib/registry/client/manifest";
import { fetchAllTagNames } from "@/lib/registry/client/tag-names";

const { selectMock } = vi.hoisted(() => ({
  selectMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: selectMock,
  }),
}));

vi.mock("@/lib/registry/client/catalog", () => ({
  listRepositoryCatalog: vi.fn(),
}));

vi.mock("@/lib/images/settings", () => ({
  enrichImagesWithVisibility: vi.fn(),
}));

vi.mock("@/lib/pulls/stats", () => ({
  getImagePullCounts: vi.fn(),
}));

vi.mock("@/lib/registry/client/auth", () => ({
  issueUserRegistryToken: vi.fn(),
}));

vi.mock("@/lib/registry/client/tag-names", () => ({
  fetchAllTagNames: vi.fn(),
}));

vi.mock("@/lib/registry/client/manifest", () => ({
  resolveManifest: vi.fn(),
}));

const publicRepository = {
  id: "repo-public",
  name: "public-repo",
  isPublic: true,
};

function mockRepositoryLookup(
  repository: typeof publicRepository | null,
) {
  selectMock.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(repository ? [repository] : []),
      }),
    }),
  });
}

describe("resolveRecommendedPullTag", () => {
  beforeEach(() => {
    vi.mocked(resolveManifest).mockReset();
  });

  it("prefers latest when present", async () => {
    const tag = await resolveRecommendedPullTag(
      "public-repo/app",
      ["v1.0.0", "latest", "v2.0.0"],
      "token",
    );

    expect(tag).toBe("latest");
    expect(resolveManifest).not.toHaveBeenCalled();
  });

  it("falls back to the highest version tag when created metadata is missing", async () => {
    vi.mocked(resolveManifest).mockResolvedValue({
      digest: "sha256:abc",
      mediaType: "application/vnd.docker.distribution.manifest.v2+json",
      size: 100,
      platforms: [],
      history: [],
      labels: {},
    });

    const tag = await resolveRecommendedPullTag(
      "public-repo/app",
      ["1.0", "1.25", "1.10"],
      "token",
    );

    expect(tag).toBe("1.25");
  });

  it("falls back to the newest created tag when latest is absent", async () => {
    vi.mocked(resolveManifest).mockImplementation(async (_fullName, tag) => ({
      digest: `sha256:${tag}`,
      mediaType: "application/vnd.docker.distribution.manifest.v2+json",
      size: 100,
      platforms: [],
      history: [
        {
          created:
            tag === "v2.0.0"
              ? "2026-01-02T00:00:00.000Z"
              : "2026-01-01T00:00:00.000Z",
          createdBy: "",
          comment: "",
          emptyLayer: false,
        },
      ],
      labels: {},
    }));

    const tag = await resolveRecommendedPullTag(
      "public-repo/app",
      ["v1.0.0", "v2.0.0"],
      "token",
    );

    expect(tag).toBe("v2.0.0");
  });
});

describe("getPublicImageTags", () => {
  beforeEach(() => {
    vi.mocked(listRepositoryCatalog).mockReset();
    vi.mocked(enrichImagesWithVisibility).mockReset();
    vi.mocked(getImagePullCounts).mockReset();
    vi.mocked(issueUserRegistryToken).mockReset();
    vi.mocked(fetchAllTagNames).mockReset();
    vi.mocked(resolveManifest).mockReset();
    mockRepositoryLookup(publicRepository);
    vi.mocked(issueUserRegistryToken).mockResolvedValue("token");
    vi.mocked(getImagePullCounts).mockResolvedValue(new Map([["app", 7]]));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns tags for a publicly pullable image", async () => {
    vi.mocked(listRepositoryCatalog).mockResolvedValue({
      images: [{ name: "app", tagCount: 2 }],
    });
    vi.mocked(enrichImagesWithVisibility).mockResolvedValue([
      {
        name: "app",
        tagCount: 2,
        anonymousPull: "inherit",
        effectiveAnonymousPull: true,
      },
    ]);
    vi.mocked(fetchAllTagNames).mockResolvedValue(["latest", "v1.0.0"]);
    vi.mocked(resolveManifest).mockResolvedValue({
      digest: "sha256:abc",
      mediaType: "application/vnd.docker.distribution.manifest.v2+json",
      size: 100,
      platforms: [],
      history: [],
      labels: {},
    });

    const result = await getPublicImageTags("public-repo", "app");

    expect(result).toEqual({
      repository: "public-repo",
      name: "app",
      tags: ["v1.0.0", "latest"],
      recommendedPullTag: "latest",
      pullCount: 7,
    });
  });

  it("returns null for unknown repositories", async () => {
    mockRepositoryLookup(null);

    const result = await getPublicImageTags("missing-repo", "app");

    expect(result).toBeNull();
  });

  it("returns null for missing images", async () => {
    vi.mocked(listRepositoryCatalog).mockResolvedValue({
      images: [{ name: "other", tagCount: 1 }],
    });

    const result = await getPublicImageTags("public-repo", "app");

    expect(result).toBeNull();
  });

  it("returns null for images without anonymous pull", async () => {
    vi.mocked(listRepositoryCatalog).mockResolvedValue({
      images: [{ name: "app", tagCount: 1 }],
    });
    vi.mocked(enrichImagesWithVisibility).mockResolvedValue([
      {
        name: "app",
        tagCount: 1,
        anonymousPull: "deny",
        effectiveAnonymousPull: false,
      },
    ]);

    const result = await getPublicImageTags("public-repo", "app");

    expect(result).toBeNull();
  });

  it("returns null when the image has no tags", async () => {
    vi.mocked(listRepositoryCatalog).mockResolvedValue({
      images: [{ name: "app", tagCount: 0 }],
    });
    vi.mocked(enrichImagesWithVisibility).mockResolvedValue([
      {
        name: "app",
        tagCount: 0,
        anonymousPull: "inherit",
        effectiveAnonymousPull: true,
      },
    ]);
    vi.mocked(fetchAllTagNames).mockResolvedValue([]);

    const result = await getPublicImageTags("public-repo", "app");

    expect(result).toBeNull();
  });
});
