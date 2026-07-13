// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { writeAuditLog } from "@/lib/audit/log";
import type { RegistryAuthUser } from "@/lib/registry/client/auth";
import { issueUserRegistryDeleteToken } from "@/lib/registry/client/delete-token";
import { RegistryUpstreamError } from "@/lib/registry/client/fetch";
import {
  deleteManifestReference,
  getManifestDigest,
} from "@/lib/registry/client/manifest";
import { getTagSiblings } from "@/lib/registry/client/tags";
import { registryJson } from "@/lib/registry/client/fetch";
import { getRepositoryByName } from "@/lib/rbac/roles";

type TagsPage = {
  tags?: string[];
};

function fullImageName(repositoryName: string, imageName: string): string {
  return `${repositoryName}/${imageName}`;
}

async function fetchAllTagNames(
  fullName: string,
  token: string,
): Promise<string[]> {
  try {
    const body = await registryJson<TagsPage>(
      `/v2/${fullName}/tags/list?n=1000`,
      token,
    );
    return body.tags ?? [];
  } catch (error) {
    if (error instanceof RegistryUpstreamError && error.status === 404) {
      return [];
    }
    throw error;
  }
}

export type DeleteTagResult = {
  tag: string;
  siblings: string[];
};

export async function deleteTag(
  user: RegistryAuthUser,
  repositoryName: string,
  imageName: string,
  tag: string,
): Promise<DeleteTagResult> {
  const token = await issueUserRegistryDeleteToken(user, repositoryName, imageName);
  const fullName = fullImageName(repositoryName, imageName);

  const siblingsResponse = await getTagSiblings(user, repositoryName, imageName, tag);
  const siblings = siblingsResponse.siblings.map((entry) => entry.name);

  await deleteManifestReference(fullName, tag, token);

  const repository = await getRepositoryByName(repositoryName);
  await writeAuditLog({
    userId: user.id,
    action: "tag.delete",
    resource: `repository:${repositoryName}/${imageName}:tag:${tag}`,
    repositoryId: repository?.id ?? null,
  });

  return { tag, siblings };
}

export type BulkDeleteResult = {
  deletedTags: string[];
  deletedDigests: string[];
};

export async function bulkDeleteTags(
  user: RegistryAuthUser,
  repositoryName: string,
  imageName: string,
  tags: string[],
): Promise<BulkDeleteResult> {
  const token = await issueUserRegistryDeleteToken(user, repositoryName, imageName);
  const fullName = fullImageName(repositoryName, imageName);

  const uniqueTags = [...new Set(tags.map((entry) => entry.trim()).filter(Boolean))];
  const deletedTags: string[] = [];
  const deletedDigests: string[] = [];
  const seenDigests = new Set<string>();

  for (const tagName of uniqueTags) {
    const manifest = await getManifestDigest(fullName, tagName, token);
    await deleteManifestReference(fullName, tagName, token);
    deletedTags.push(tagName);

    if (manifest?.digest && !seenDigests.has(manifest.digest)) {
      seenDigests.add(manifest.digest);
      deletedDigests.push(manifest.digest);
    }
  }

  if (deletedTags.length > 0) {
    const repository = await getRepositoryByName(repositoryName);
    await writeAuditLog({
      userId: user.id,
      action: "tag.bulk_delete",
      resource: `repository:${repositoryName}/${imageName}:tags:${deletedTags.join(",")}`,
      repositoryId: repository?.id ?? null,
    });
  }

  return { deletedTags, deletedDigests };
}

export type DeleteImageResult = {
  deletedTags: string[];
  deletedDigests: string[];
};

export async function deleteImage(
  user: RegistryAuthUser,
  repositoryName: string,
  imageName: string,
): Promise<DeleteImageResult> {
  const token = await issueUserRegistryDeleteToken(user, repositoryName, imageName);
  const fullName = fullImageName(repositoryName, imageName);

  const allTags = await fetchAllTagNames(fullName, token);
  const digestSet = new Set<string>();

  for (const tagName of allTags) {
    const manifest = await getManifestDigest(fullName, tagName, token);
    if (manifest?.digest) {
      digestSet.add(manifest.digest);
    }
  }

  const deletedDigests = [...digestSet];

  for (const digest of deletedDigests) {
    await deleteManifestReference(fullName, digest, token);
  }

  if (allTags.length > 0) {
    const repository = await getRepositoryByName(repositoryName);
    await writeAuditLog({
      userId: user.id,
      action: "repository.delete",
      resource: `repository:${repositoryName}/${imageName}`,
      repositoryId: repository?.id ?? null,
    });
  }

  return { deletedTags: allTags, deletedDigests };
}
