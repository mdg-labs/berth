// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { getDb } from "@/lib/db";
import { repositories } from "@/lib/db/schema";
import { enrichImagesWithVisibility } from "@/lib/images/settings";
import { getImagePullCounts } from "@/lib/pulls/stats";
import { listRepositoryCatalog } from "@/lib/registry/client/catalog";

import { SERVER_REGISTRY_BROWSE_USER } from "./registry-auth";

export type PublicImage = {
  repository: string;
  name: string;
  tagCount: number;
  pullCount: number;
};

export type PublicImagesResponse = {
  images: PublicImage[];
  total: number;
};

function matchesSearch(
  repository: string,
  imageName: string,
  searchLower: string,
): boolean {
  const qualified = `${repository}/${imageName}`.toLowerCase();
  return (
    qualified.includes(searchLower) ||
    repository.toLowerCase().includes(searchLower) ||
    imageName.toLowerCase().includes(searchLower)
  );
}

export async function listPublicImages(
  search?: string,
): Promise<PublicImagesResponse> {
  const db = getDb();
  const repositoryRows = await db
    .select({
      id: repositories.id,
      name: repositories.name,
      isPublic: repositories.isPublic,
    })
    .from(repositories);

  const searchLower = search?.trim().toLowerCase() ?? "";
  const images: PublicImage[] = [];

  await Promise.all(
    repositoryRows.map(async (repository) => {
      try {
        const catalog = await listRepositoryCatalog(
          SERVER_REGISTRY_BROWSE_USER,
          repository.name,
        );
        const enriched = await enrichImagesWithVisibility(
          repository.id,
          repository.isPublic,
          catalog.images,
        );
        const publicImages = enriched.filter(
          (image) => image.effectiveAnonymousPull && image.tagCount > 0,
        );

        if (publicImages.length === 0) {
          return;
        }

        const pullCounts = await getImagePullCounts(
          repository.id,
          publicImages.map((image) => image.name),
        );

        for (const image of publicImages) {
          if (
            searchLower &&
            !matchesSearch(repository.name, image.name, searchLower)
          ) {
            continue;
          }

          images.push({
            repository: repository.name,
            name: image.name,
            tagCount: image.tagCount,
            pullCount: pullCounts.get(image.name) ?? 0,
          });
        }
      } catch {
        // Registry unreachable or forbidden for this repository — skip.
      }
    }),
  );

  images.sort((a, b) => {
    const left = `${a.repository}/${a.name}`;
    const right = `${b.repository}/${b.name}`;
    return left.localeCompare(right);
  });

  return {
    images,
    total: images.length,
  };
}
