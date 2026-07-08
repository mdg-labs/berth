// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { repositories } from "@/lib/db/schema";
import { enrichImagesWithVisibility } from "@/lib/images/settings";
import { getImagePullCounts } from "@/lib/pulls/stats";
import { issueUserRegistryToken } from "@/lib/registry/client/auth";
import { listRepositoryCatalog } from "@/lib/registry/client/catalog";
import { resolveManifest } from "@/lib/registry/client/manifest";
import { fetchAllTagNames } from "@/lib/registry/client/tag-names";

import { SERVER_REGISTRY_BROWSE_USER } from "./registry-auth";

export type PublicImageTagsResponse = {
  repository: string;
  name: string;
  tags: string[];
  recommendedPullTag: string;
  pullCount: number;
};

function sortTagsDescending(tags: string[]): string[] {
  return [...tags].sort((a, b) =>
    b.localeCompare(a, undefined, { numeric: true }),
  );
}

async function resolveTagCreatedAt(
  fullName: string,
  tag: string,
  token: string,
): Promise<string> {
  try {
    const manifest = await resolveManifest(fullName, tag, token);
    return manifest.history[0]?.created ?? "";
  } catch {
    return "";
  }
}

export async function resolveRecommendedPullTag(
  fullName: string,
  tags: string[],
  token: string,
): Promise<string> {
  if (tags.length === 0) {
    return "latest";
  }

  if (tags.includes("latest")) {
    return "latest";
  }

  const dated = await Promise.all(
    tags.map(async (tag) => ({
      tag,
      created: await resolveTagCreatedAt(fullName, tag, token),
    })),
  );

  dated.sort((left, right) => {
    if (left.created && right.created) {
      const byDate = right.created.localeCompare(left.created);
      if (byDate !== 0) {
        return byDate;
      }
    } else if (left.created) {
      return -1;
    } else if (right.created) {
      return 1;
    }

    return right.tag.localeCompare(left.tag, undefined, { numeric: true });
  });

  return dated[0]!.tag;
}

export async function getPublicImageTags(
  repositoryName: string,
  imageName: string,
): Promise<PublicImageTagsResponse | null> {
  const db = getDb();
  const [repository] = await db
    .select({
      id: repositories.id,
      name: repositories.name,
      isPublic: repositories.isPublic,
    })
    .from(repositories)
    .where(eq(repositories.name, repositoryName))
    .limit(1);

  if (!repository) {
    return null;
  }

  let catalog;
  try {
    catalog = await listRepositoryCatalog(
      SERVER_REGISTRY_BROWSE_USER,
      repository.name,
    );
  } catch {
    return null;
  }

  const catalogImage = catalog.images.find((image) => image.name === imageName);
  if (!catalogImage) {
    return null;
  }

  const [enriched] = await enrichImagesWithVisibility(
    repository.id,
    repository.isPublic,
    [catalogImage],
  );

  if (!enriched?.effectiveAnonymousPull) {
    return null;
  }

  const token = await issueUserRegistryToken(
    SERVER_REGISTRY_BROWSE_USER,
    repository.name,
    imageName,
  );
  const fullName = `${repository.name}/${imageName}`;
  const tagNames = await fetchAllTagNames(fullName, token);

  if (tagNames.length === 0) {
    return null;
  }

  const pullCounts = await getImagePullCounts(repository.id, [imageName]);
  const recommendedPullTag = await resolveRecommendedPullTag(
    fullName,
    tagNames,
    token,
  );

  return {
    repository: repository.name,
    name: imageName,
    tags: sortTagsDescending(tagNames),
    recommendedPullTag,
    pullCount: pullCounts.get(imageName) ?? 0,
  };
}
