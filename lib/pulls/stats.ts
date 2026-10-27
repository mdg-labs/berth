// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { and, eq, inArray } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { pullCounters } from "@/lib/db/schema";
import type { TagSummary } from "@/lib/registry/client/types";

export async function getRepositoryPullCount(repositoryId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ count: pullCounters.count })
    .from(pullCounters)
    .where(
      and(
        eq(pullCounters.repositoryId, repositoryId),
        eq(pullCounters.scope, "repository"),
        eq(pullCounters.imageName, ""),
        eq(pullCounters.tagReference, ""),
      ),
    )
    .limit(1);

  return row?.count ?? 0;
}

export async function getImagePullCounts(
  repositoryId: string,
  imageNames: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (imageNames.length === 0) {
    return counts;
  }

  const db = getDb();
  const rows = await db
    .select({
      imageName: pullCounters.imageName,
      count: pullCounters.count,
    })
    .from(pullCounters)
    .where(
      and(
        eq(pullCounters.repositoryId, repositoryId),
        eq(pullCounters.scope, "image"),
        inArray(pullCounters.imageName, imageNames),
      ),
    );

  for (const row of rows) {
    counts.set(row.imageName, row.count);
  }

  return counts;
}

export async function getTagPullCounts(
  repositoryId: string,
  imageName: string,
  tagNames: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (tagNames.length === 0) {
    return counts;
  }

  const db = getDb();
  const rows = await db
    .select({
      tagReference: pullCounters.tagReference,
      count: pullCounters.count,
    })
    .from(pullCounters)
    .where(
      and(
        eq(pullCounters.repositoryId, repositoryId),
        eq(pullCounters.scope, "tag"),
        eq(pullCounters.imageName, imageName),
        inArray(pullCounters.tagReference, tagNames),
      ),
    );

  for (const row of rows) {
    counts.set(row.tagReference, row.count);
  }

  return counts;
}

/** Counter keys needed to resolve pull counts for a page of tag summaries. */
export function pullCountKeysForTags(tags: TagSummary[]): string[] {
  const keys = new Set<string>();

  for (const tag of tags) {
    if (tag.isUntagged) {
      keys.add(tag.digest);
      continue;
    }

    keys.add(tag.name);
    if (tag.siblings.length === 0) {
      keys.add(tag.digest);
    }
  }

  return [...keys];
}

/** Resolve the pull count shown for a tag row (tag name, digest-only, or untagged). */
export function resolveTagPullCount(
  tag: TagSummary,
  pullCounts: Map<string, number>,
): number {
  if (tag.isUntagged) {
    return pullCounts.get(tag.digest) ?? 0;
  }

  const tagPulls = pullCounts.get(tag.name) ?? 0;
  if (tagPulls > 0) {
    return tagPulls;
  }

  if (tag.siblings.length === 0) {
    return pullCounts.get(tag.digest) ?? 0;
  }

  return 0;
}
