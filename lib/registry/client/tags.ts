// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import type { RegistryAuthUser } from "./auth";
import { issueUserRegistryToken } from "./auth";
import { getManifestDigest, resolveManifest } from "./manifest";
import { fetchAllTagNames } from "./tag-names";
import {
  isRegistryStorageReadable,
  listUntaggedDigests,
} from "@/lib/registry/storage/untagged-digests";
import type {
  SiblingsResponse,
  TagDetail,
  TagsListResponse,
  TagSummary,
} from "./types";

export type TagsQuery = {
  search?: string;
  sort?: "name" | "name_desc";
  page?: number;
  pageSize?: number;
  includeUntagged?: boolean;
};

function fullImageName(repositoryName: string, imageName: string): string {
  return `${repositoryName}/${imageName}`;
}

function sortByName(items: TagSummary[], sort: TagsQuery["sort"]): TagSummary[] {
  const sorted = [...items];
  const direction = sort === "name_desc" ? -1 : 1;
  sorted.sort(
    (a, b) =>
      direction * a.name.localeCompare(b.name, undefined, { numeric: true }),
  );
  return sorted;
}

function filterTagSummaries(
  items: TagSummary[],
  search?: string,
): TagSummary[] {
  const query = search?.trim().toLowerCase() ?? "";
  if (!query) {
    return items;
  }

  return items.filter(
    (item) =>
      item.name.toLowerCase().includes(query) ||
      item.digest.toLowerCase().includes(query),
  );
}

export function buildSiblingMapForTags(
  tagDigests: Array<{ name: string; digest: string }>,
): Map<string, string[]> {
  const tagsByDigest = new Map<string, string[]>();

  for (const { name, digest } of tagDigests) {
    if (!digest) {
      continue;
    }

    const group = tagsByDigest.get(digest) ?? [];
    group.push(name);
    tagsByDigest.set(digest, group);
  }

  const siblingsByTag = new Map<string, string[]>();

  for (const { name, digest } of tagDigests) {
    if (!digest) {
      siblingsByTag.set(name, []);
      continue;
    }

    siblingsByTag.set(
      name,
      (tagsByDigest.get(digest) ?? []).filter((candidate) => candidate !== name),
    );
  }

  return siblingsByTag;
}

async function buildTaggedSummaries(
  fullName: string,
  token: string,
  allTags: string[],
): Promise<TagSummary[]> {
  const manifestEntries = await Promise.all(
    allTags.map(async (tagName) => {
      const manifest = await getManifestDigest(fullName, tagName, token);
      return {
        name: tagName,
        digest: manifest?.digest ?? "",
        size: manifest?.size ?? 0,
      };
    }),
  );

  const siblingsByTag = buildSiblingMapForTags(manifestEntries);

  return manifestEntries.map((entry) => ({
    name: entry.name,
    digest: entry.digest,
    size: entry.size,
    pushedAt: null,
    siblings: siblingsByTag.get(entry.name) ?? [],
    isUntagged: false,
  }));
}

async function buildUntaggedSummaries(
  fullName: string,
  token: string,
  digests: string[],
): Promise<TagSummary[]> {
  const summaries: TagSummary[] = [];

  for (const digest of digests) {
    const manifest = await getManifestDigest(fullName, digest, token);
    if (!manifest) {
      continue;
    }

    summaries.push({
      name: digest,
      digest: manifest.digest,
      size: manifest.size,
      pushedAt: null,
      siblings: [],
      isUntagged: true,
    });
  }

  return summaries;
}

export async function listImageTags(
  user: RegistryAuthUser,
  repositoryName: string,
  imageName: string,
  query: TagsQuery = {},
): Promise<TagsListResponse> {
  const token = await issueUserRegistryToken(user, repositoryName, imageName);
  const fullName = fullImageName(repositoryName, imageName);

  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25));

  const allTags = await fetchAllTagNames(fullName, token);
  const taggedSummaries = await buildTaggedSummaries(fullName, token, allTags);

  let untaggedSupported: boolean | undefined;
  let combined = [...taggedSummaries];

  if (query.includeUntagged) {
    untaggedSupported = await isRegistryStorageReadable();

    if (untaggedSupported) {
      const untaggedDigests = await listUntaggedDigests(fullName);
      const untaggedSummaries = await buildUntaggedSummaries(
        fullName,
        token,
        untaggedDigests,
      );
      combined = [...taggedSummaries, ...untaggedSummaries];
    }
  }

  const filtered = filterTagSummaries(combined, query.search);
  const sorted = sortByName(filtered, query.sort ?? "name");
  const start = (page - 1) * pageSize;
  const pageItems = sorted.slice(start, start + pageSize);

  return {
    tags: pageItems,
    total: sorted.length,
    page,
    pageSize,
    ...(query.includeUntagged ? { untaggedSupported } : {}),
  };
}

export async function getTagDetail(
  user: RegistryAuthUser,
  repositoryName: string,
  imageName: string,
  tag: string,
): Promise<TagDetail | null> {
  const token = await issueUserRegistryToken(user, repositoryName, imageName);
  const fullName = fullImageName(repositoryName, imageName);

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
  repositoryName: string,
  imageName: string,
  tag: string,
): Promise<SiblingsResponse> {
  const token = await issueUserRegistryToken(user, repositoryName, imageName);
  const fullName = fullImageName(repositoryName, imageName);

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
