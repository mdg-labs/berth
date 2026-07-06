// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import type { RegistryAuthUser } from "./auth";
import { issueUserRegistryToken } from "./auth";
import { registryJson } from "./fetch";
import { RegistryUpstreamError } from "./fetch";
import { getManifestDigest, resolveManifest } from "./manifest";
import type {
  SiblingsResponse,
  TagDetail,
  TagsListResponse,
  TagSummary,
} from "./types";

type TagsPage = {
  tags?: string[];
};

export type TagsQuery = {
  search?: string;
  sort?: "name" | "name_desc";
  page?: number;
  pageSize?: number;
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

function sortTags(tags: string[], sort: TagsQuery["sort"]): string[] {
  const sorted = [...tags];
  if (sort === "name_desc") {
    sorted.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  } else {
    sorted.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }
  return sorted;
}

function filterTags(tags: string[], search?: string): string[] {
  const query = search?.trim().toLowerCase() ?? "";
  if (!query) {
    return tags;
  }
  return tags.filter((tag) => tag.toLowerCase().includes(query));
}

export async function listRepositoryTags(
  user: RegistryAuthUser,
  projectName: string,
  repoName: string,
  query: TagsQuery = {},
): Promise<TagsListResponse> {
  const token = await issueUserRegistryToken(user, projectName, repoName);
  const fullName = fullRepoName(projectName, repoName);

  const allTags = await fetchAllTagNames(fullName, token);
  const filtered = filterTags(allTags, query.search);
  const sorted = sortTags(filtered, query.sort ?? "name");

  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25));
  const start = (page - 1) * pageSize;
  const pageTags = sorted.slice(start, start + pageSize);

  const summaries: TagSummary[] = [];

  for (const tagName of pageTags) {
    const manifest = await getManifestDigest(fullName, tagName, token);
    summaries.push({
      name: tagName,
      digest: manifest?.digest ?? "",
      size: manifest?.size ?? 0,
      pushedAt: null,
    });
  }

  return {
    tags: summaries,
    total: sorted.length,
    page,
    pageSize,
  };
}

export async function getTagDetail(
  user: RegistryAuthUser,
  projectName: string,
  repoName: string,
  tag: string,
): Promise<TagDetail | null> {
  const token = await issueUserRegistryToken(user, projectName, repoName);
  const fullName = fullRepoName(projectName, repoName);

  try {
    const resolved = await resolveManifest(fullName, tag, token);
    return {
      name: tag,
      digest: resolved.digest,
      mediaType: resolved.mediaType,
      size: resolved.size,
      pushedAt: resolved.history[0]?.created ?? null,
      platforms: resolved.platforms,
      history: resolved.history,
      labels: resolved.labels,
    };
  } catch {
    return null;
  }
}

export async function getTagSiblings(
  user: RegistryAuthUser,
  projectName: string,
  repoName: string,
  tag: string,
): Promise<SiblingsResponse> {
  const token = await issueUserRegistryToken(user, projectName, repoName);
  const fullName = fullRepoName(projectName, repoName);

  const target = await getManifestDigest(fullName, tag, token);
  if (!target?.digest) {
    return { siblings: [] };
  }

  const allTags = await fetchAllTagNames(fullName, token);
  const siblings: { name: string }[] = [];

  for (const candidate of allTags) {
    if (candidate === tag) {
      continue;
    }

    const manifest = await getManifestDigest(fullName, candidate, token);
    if (manifest?.digest === target.digest) {
      siblings.push({ name: candidate });
    }
  }

  return { siblings };
}
