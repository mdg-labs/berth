// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { listPublicImages } from "@/lib/public/images";
import { enrichImagesWithVisibility } from "@/lib/images/settings";
import { getImagePullCounts } from "@/lib/pulls/stats";
import { listRepositoryCatalog } from "@/lib/registry/client/catalog";

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

const repositories = [
  { id: "repo-public", name: "public-repo", isPublic: true },
  { id: "repo-private", name: "private-repo", isPublic: false },
];

function mockRepositories(rows: typeof repositories) {
  selectMock.mockReturnValue({
    from: vi.fn().mockResolvedValue(rows),
  });
}

describe("listPublicImages", () => {
  beforeEach(() => {
    vi.mocked(listRepositoryCatalog).mockReset();
    vi.mocked(enrichImagesWithVisibility).mockReset();
    vi.mocked(getImagePullCounts).mockReset();
    mockRepositories(repositories);
    vi.mocked(getImagePullCounts).mockResolvedValue(new Map());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("includes images from public repositories with effective anonymous pull", async () => {
    vi.mocked(listRepositoryCatalog).mockImplementation(async (_user, name) => ({
      images:
        name === "public-repo"
          ? [{ name: "app", tagCount: 2 }]
          : [{ name: "secret", tagCount: 1 }],
    }));
    vi.mocked(enrichImagesWithVisibility).mockImplementation(
      async (repositoryId, repositoryIsPublic, images) =>
        images.map((image) => ({
          ...image,
          anonymousPull: "inherit" as const,
          effectiveAnonymousPull: repositoryIsPublic,
        })),
    );
    vi.mocked(getImagePullCounts).mockImplementation(async (repositoryId) => {
      if (repositoryId === "repo-public") {
        return new Map([["app", 5]]);
      }
      return new Map();
    });

    const result = await listPublicImages();

    expect(result.total).toBe(1);
    expect(result.images).toEqual([
      {
        repository: "public-repo",
        name: "app",
        tagCount: 2,
        pullCount: 5,
      },
    ]);
  });

  it("includes allow overrides on private repositories", async () => {
    vi.mocked(listRepositoryCatalog).mockResolvedValue({
      images: [{ name: "shared", tagCount: 1 }],
    });
    vi.mocked(enrichImagesWithVisibility).mockResolvedValue([
      {
        name: "shared",
        tagCount: 1,
        anonymousPull: "allow",
        effectiveAnonymousPull: true,
      },
    ]);
    vi.mocked(getImagePullCounts).mockResolvedValue(new Map([["shared", 3]]));

    const result = await listPublicImages();

    expect(result.images).toEqual([
      {
        repository: "private-repo",
        name: "shared",
        tagCount: 1,
        pullCount: 3,
      },
      {
        repository: "public-repo",
        name: "shared",
        tagCount: 1,
        pullCount: 3,
      },
    ]);
  });

  it("excludes private images and zero-tag entries", async () => {
    vi.mocked(listRepositoryCatalog).mockResolvedValue({
      images: [
        { name: "private-image", tagCount: 2 },
        { name: "empty", tagCount: 0 },
      ],
    });
    vi.mocked(enrichImagesWithVisibility).mockResolvedValue([
      {
        name: "private-image",
        tagCount: 2,
        anonymousPull: "deny",
        effectiveAnonymousPull: false,
      },
      {
        name: "empty",
        tagCount: 0,
        anonymousPull: "inherit",
        effectiveAnonymousPull: true,
      },
    ]);

    const result = await listPublicImages();

    expect(result.images).toEqual([]);
    expect(result.total).toBe(0);
  });

  it("filters by search across repository and image name", async () => {
    vi.mocked(listRepositoryCatalog).mockImplementation(async (_user, name) => ({
      images: [{ name: name === "public-repo" ? "web" : "api", tagCount: 1 }],
    }));
    vi.mocked(enrichImagesWithVisibility).mockImplementation(
      async (_repositoryId, repositoryIsPublic, images) =>
        images.map((image) => ({
          ...image,
          anonymousPull: "inherit" as const,
          effectiveAnonymousPull: repositoryIsPublic || image.name === "api",
        })),
    );

    const result = await listPublicImages("web");

    expect(result.images).toEqual([
      {
        repository: "public-repo",
        name: "web",
        tagCount: 1,
        pullCount: 0,
      },
    ]);
  });

  it("sorts images by qualified repository/name", async () => {
    mockRepositories([{ id: "repo-a", name: "zebra", isPublic: true }]);
    vi.mocked(listRepositoryCatalog).mockResolvedValue({
      images: [
        { name: "zeta", tagCount: 1 },
        { name: "alpha", tagCount: 1 },
      ],
    });
    vi.mocked(enrichImagesWithVisibility).mockResolvedValue([
      {
        name: "zeta",
        tagCount: 1,
        anonymousPull: "inherit",
        effectiveAnonymousPull: true,
      },
      {
        name: "alpha",
        tagCount: 1,
        anonymousPull: "inherit",
        effectiveAnonymousPull: true,
      },
    ]);

    const result = await listPublicImages();

    expect(result.images.map((image) => image.name)).toEqual(["alpha", "zeta"]);
  });

  it("returns empty list when registry is unreachable", async () => {
    vi.mocked(listRepositoryCatalog).mockRejectedValue(new Error("unavailable"));

    const result = await listPublicImages();

    expect(result.images).toEqual([]);
    expect(result.total).toBe(0);
  });
});
