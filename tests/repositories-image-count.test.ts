// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { beforeEach, describe, expect, it, vi } from "vitest";

import { listRepositoryCatalog } from "@/lib/registry/client/catalog";
import { countNonEmptyImagesForRepositories } from "@/lib/repositories/registry";

vi.mock("@/lib/registry/client/catalog", () => ({
  listRepositoryCatalog: vi.fn(),
}));

const user = {
  id: "user-1",
  email: "dev@example.com",
  systemRole: "admin" as const,
};

describe("countNonEmptyImagesForRepositories", () => {
  beforeEach(() => {
    vi.mocked(listRepositoryCatalog).mockReset();
  });

  it("reuses repository catalog results for image counts", async () => {
    vi.mocked(listRepositoryCatalog).mockImplementation(async (_user, name) => ({
      images:
        name === "demo"
          ? [{ name: "app", tagCount: 3 }]
          : [{ name: "web", tagCount: 1 }, { name: "api", tagCount: 2 }],
    }));

    const counts = await countNonEmptyImagesForRepositories(user, [
      "demo",
      "other",
    ]);

    expect(counts.get("demo")).toBe(1);
    expect(counts.get("other")).toBe(2);
  });
});
