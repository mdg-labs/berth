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
import { isDigestReference } from "@/lib/catalog/format";
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

export type BulkDeleteItem = {
  name: string;
  isUntagged?: boolean;
};

export type BulkDeleteResult = {
  deletedTags: string[];
  deletedDigests: string[];
};

export async function deleteManifestDigest(
  user: RegistryAuthUser,
  repositoryName: string,
  imageName: string,
  digest: string,
): Promise<{ digest: string }> {
  const token = await issueUserRegistryDeleteToken(user, repositoryName, imageName);
  const fullName = fullImageName(repositoryName, imageName);

  await deleteManifestReference(fullName, digest, token);

  const repository = await getRepositoryByName(repositoryName);
  await writeAuditLog({
    userId: user.id,
    action: "manifest.delete",
    resource: `repository:${repositoryName}/${imageName}:digest:${digest}`,
    repositoryId: repository?.id ?? null,
  });

  return { digest };
}

export async function bulkDeleteTags(
  user: RegistryAuthUser,
  repositoryName: string,
  imageName: string,
  items: BulkDeleteItem[],
): Promise<BulkDeleteResult> {
  const token = await issueUserRegistryDeleteToken(user, repositoryName, imageName);
  const fullName = fullImageName(repositoryName, imageName);

  const uniqueItems = items.filter(
    (item, index, array) =>
      item.name.trim() !== "" &&
      array.findIndex((candidate) => candidate.name === item.name) === index,
  );

  const deletedTags: string[] = [];
  const deletedDigests: string[] = [];
  const seenDigests = new Set<string>();

  for (const item of uniqueItems) {
    if (item.isUntagged || isDigestReference(item.name)) {
      await deleteManifestReference(fullName, item.name, token);
      if (!seenDigests.has(item.name)) {
        seenDigests.add(item.name);
        deletedDigests.push(item.name);
      }
      continue;
    }

    const manifest = await getManifestDigest(fullName, item.name, token);
    await deleteManifestReference(fullName, item.name, token);
    deletedTags.push(item.name);

    if (manifest?.digest && !seenDigests.has(manifest.digest)) {
      seenDigests.add(manifest.digest);
      deletedDigests.push(manifest.digest);
    }
  }

  if (deletedTags.length > 0 || deletedDigests.length > 0) {
    const repository = await getRepositoryByName(repositoryName);
    const resourceParts = [
      ...deletedTags.map((tag) => `tag:${tag}`),
      ...deletedDigests.map((digest) => `digest:${digest}`),
    ];
    await writeAuditLog({
      userId: user.id,
      action: "tag.bulk_delete",
      resource: `repository:${repositoryName}/${imageName}:${resourceParts.join(",")}`,
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
