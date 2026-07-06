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

type TagsPage = {
  tags?: string[];
};

function fullRepoName(projectName: string, repoName: string): string {
  return `${projectName}/${repoName}`;
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
  projectName: string,
  repoName: string,
  tag: string,
): Promise<DeleteTagResult> {
  const token = await issueUserRegistryDeleteToken(user, projectName, repoName);
  const fullName = fullRepoName(projectName, repoName);

  const siblingsResponse = await getTagSiblings(user, projectName, repoName, tag);
  const siblings = siblingsResponse.siblings.map((entry) => entry.name);

  await deleteManifestReference(fullName, tag, token);

  await writeAuditLog({
    userId: user.id,
    action: "tag.delete",
    resource: `project:${projectName}/${repoName}:tag:${tag}`,
  });

  return { tag, siblings };
}

export type BulkDeleteResult = {
  deletedTags: string[];
  deletedDigests: string[];
};

export async function bulkDeleteTags(
  user: RegistryAuthUser,
  projectName: string,
  repoName: string,
  tags: string[],
): Promise<BulkDeleteResult> {
  const token = await issueUserRegistryDeleteToken(user, projectName, repoName);
  const fullName = fullRepoName(projectName, repoName);

  const uniqueTags = [...new Set(tags.map((entry) => entry.trim()).filter(Boolean))];
  const digestToTags = new Map<string, string[]>();

  for (const tagName of uniqueTags) {
    const manifest = await getManifestDigest(fullName, tagName, token);
    if (!manifest?.digest) {
      continue;
    }

    const existing = digestToTags.get(manifest.digest) ?? [];
    existing.push(tagName);
    digestToTags.set(manifest.digest, existing);
  }

  const deletedTags: string[] = [];
  const deletedDigests: string[] = [];

  for (const [digest, tagNames] of digestToTags) {
    await deleteManifestReference(fullName, digest, token);
    deletedDigests.push(digest);
    deletedTags.push(...tagNames);
  }

  if (deletedTags.length > 0) {
    await writeAuditLog({
      userId: user.id,
      action: "tag.bulk_delete",
      resource: `project:${projectName}/${repoName}:tags:${deletedTags.join(",")}`,
    });
  }

  return { deletedTags, deletedDigests };
}

export type DeleteRepositoryResult = {
  deletedTags: string[];
  deletedDigests: string[];
};

export async function deleteRepository(
  user: RegistryAuthUser,
  projectName: string,
  repoName: string,
): Promise<DeleteRepositoryResult> {
  const token = await issueUserRegistryDeleteToken(user, projectName, repoName);
  const fullName = fullRepoName(projectName, repoName);

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
    await writeAuditLog({
      userId: user.id,
      action: "repository.delete",
      resource: `project:${projectName}/${repoName}`,
    });
  }

  return { deletedTags: allTags, deletedDigests };
}
