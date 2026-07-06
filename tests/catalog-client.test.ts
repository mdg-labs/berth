// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { beforeEach, describe, expect, it, vi } from "vitest";

import { listRepositoryCatalog } from "@/lib/registry/client/catalog";
import { issueUserRegistryToken } from "@/lib/registry/client/auth";
import { registryJson } from "@/lib/registry/client/fetch";

vi.mock("@/lib/registry/client/auth", () => ({
  issueUserRegistryToken: vi.fn(),
}));

vi.mock("@/lib/registry/client/fetch", () => ({
  registryJson: vi.fn(),
}));

const user = {
  id: "user-1",
  email: "dev@example.com",
  systemRole: "user" as const,
};

describe("listRepositoryCatalog", () => {
  beforeEach(() => {
    vi.mocked(issueUserRegistryToken).mockReset();
    vi.mocked(registryJson).mockReset();
    vi.mocked(issueUserRegistryToken).mockResolvedValue("token-abc");
  });

  it("filters repositories to the project prefix and counts tags", async () => {
    vi.mocked(registryJson)
      .mockResolvedValueOnce({
        repositories: ["demo/app", "demo/web", "other/x"],
      })
      .mockResolvedValueOnce({ tags: ["latest"] })
      .mockResolvedValueOnce({ tags: ["1.0", "1.1"] });

    const result = await listRepositoryCatalog(user, "demo");

    expect(issueUserRegistryToken).toHaveBeenCalledWith(
      user,
      "demo",
      undefined,
      { catalog: true },
    );
    expect(result.images).toEqual([
      { name: "app", tagCount: 1 },
      { name: "web", tagCount: 2 },
    ]);
  });
});
