// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import type { RegistryAuthUser } from "./auth";
import { issueUserRegistryToken } from "./auth";
import { registryJson } from "./fetch";
import type { CatalogRepository, CatalogResponse } from "./types";

type CatalogPage = {
  repositories?: string[];
};

async function countTags(
  fullRepoName: string,
  token: string,
): Promise<number> {
  try {
    const body = await registryJson<{ tags?: string[] }>(
      `/v2/${fullRepoName}/tags/list?n=1`,
      token,
    );
    return body.tags?.length ?? 0;
  } catch {
    return 0;
  }
}

export async function listProjectCatalog(
  user: RegistryAuthUser,
  projectName: string,
  search?: string,
): Promise<CatalogResponse> {
  const token = await issueUserRegistryToken(user, projectName, undefined, {
    catalog: true,
  });

  const body = await registryJson<CatalogPage>(
    "/v2/_catalog?n=1000",
    token,
  );

  const prefix = `${projectName}/`;
  const searchLower = search?.trim().toLowerCase() ?? "";

  const candidates = (body.repositories ?? [])
    .filter((name) => name.startsWith(prefix))
    .map((name) => name.slice(prefix.length))
    .filter((name) => name.length > 0)
    .filter((name) =>
      searchLower ? name.toLowerCase().includes(searchLower) : true,
    )
    .sort((a, b) => a.localeCompare(b));

  const repositories: CatalogRepository[] = [];

  for (const shortName of candidates) {
    const tagCount = await countTags(`${projectName}/${shortName}`, token);
    if (tagCount > 0) {
      repositories.push({ name: shortName, tagCount });
    }
  }

  return { repositories };
}
