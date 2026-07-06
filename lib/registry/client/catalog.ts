// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import type { RegistryAuthUser } from "./auth";
import { issueUserRegistryToken } from "./auth";
import { registryJson } from "./fetch";
import type { CatalogImage, CatalogResponse } from "./types";

type CatalogPage = {
  repositories?: string[];
};

async function countTags(
  fullImageName: string,
  token: string,
): Promise<number> {
  try {
    const body = await registryJson<{ tags?: string[] }>(
      `/v2/${fullImageName}/tags/list?n=1`,
      token,
    );
    return body.tags?.length ?? 0;
  } catch {
    return 0;
  }
}

export async function listRepositoryCatalog(
  user: RegistryAuthUser,
  repositoryName: string,
  search?: string,
): Promise<CatalogResponse> {
  const token = await issueUserRegistryToken(user, repositoryName, undefined, {
    catalog: true,
  });

  const body = await registryJson<CatalogPage>(
    "/v2/_catalog?n=1000",
    token,
  );

  const prefix = `${repositoryName}/`;
  const searchLower = search?.trim().toLowerCase() ?? "";

  const candidates = (body.repositories ?? [])
    .filter((name) => name.startsWith(prefix))
    .map((name) => name.slice(prefix.length))
    .filter((name) => name.length > 0)
    .filter((name) =>
      searchLower ? name.toLowerCase().includes(searchLower) : true,
    )
    .sort((a, b) => a.localeCompare(b));

  const images: CatalogImage[] = [];

  for (const shortName of candidates) {
    const repoToken = await issueUserRegistryToken(
      user,
      repositoryName,
      shortName,
    );
    const tagCount = await countTags(`${repositoryName}/${shortName}`, repoToken);
    if (tagCount > 0) {
      images.push({ name: shortName, tagCount });
    }
  }

  return { images };
}
