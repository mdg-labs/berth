// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { and, eq, gte, sql } from "drizzle-orm";

import { findUserByEmail } from "@/lib/auth/credentials";
import { getDb } from "@/lib/db";
import { pullCounters, pullEvents } from "@/lib/db/schema";
import {
  computePullCounterIncrements,
  getPullDedupeSinceDate,
} from "@/lib/pulls/dedupe";
import { getRepositoryByName } from "@/lib/rbac/roles";

export type RecordPullEventInput = {
  repositoryName: string;
  imageName: string;
  reference: string;
  isDigestReference: boolean;
  digest: string;
  tokenSubject: string | null;
};

async function hasRecentDigestPull(
  repositoryId: string,
  digest: string,
  imageName: string | null,
  since: Date,
): Promise<boolean> {
  const db = getDb();
  const conditions = [
    eq(pullEvents.repositoryId, repositoryId),
    eq(pullEvents.digest, digest),
    gte(pullEvents.pulledAt, since),
  ];

  if (imageName !== null) {
    conditions.push(eq(pullEvents.imageName, imageName));
  }

  const [row] = await db
    .select({ id: pullEvents.id })
    .from(pullEvents)
    .where(and(...conditions))
    .limit(1);

  return Boolean(row);
}

export async function recordPullEvent(input: RecordPullEventInput): Promise<void> {
  const repository = await getRepositoryByName(input.repositoryName);
  if (!repository) {
    return;
  }

  const since = getPullDedupeSinceDate();
  const [hasRecentImageDigestPull, hasRecentRepositoryDigestPull] = await Promise.all([
    hasRecentDigestPull(repository.id, input.digest, input.imageName, since),
    hasRecentDigestPull(repository.id, input.digest, null, since),
  ]);

  const tagReference = input.isDigestReference ? null : input.reference;
  const tagCounterReference = input.isDigestReference
    ? input.reference
    : tagReference;
  const increments = computePullCounterIncrements(
    tagReference,
    input.isDigestReference,
    {
      hasRecentImageDigestPull,
      hasRecentRepositoryDigestPull,
    },
  );

  let userId: string | null = null;
  const anonymous =
    !input.tokenSubject || input.tokenSubject === "anonymous";

  if (!anonymous && input.tokenSubject) {
    const user = await findUserByEmail(input.tokenSubject);
    userId = user?.id ?? null;
  }

  const db = getDb();

  await db.transaction(async (tx) => {
    await tx.insert(pullEvents).values({
      repositoryId: repository.id,
      imageName: input.imageName,
      tagReference,
      digest: input.digest,
      userId,
      anonymous,
    });

    if (increments.tag && tagCounterReference) {
      await tx
        .insert(pullCounters)
        .values({
          repositoryId: repository.id,
          scope: "tag",
          imageName: input.imageName,
          tagReference: tagCounterReference,
          count: 1,
        })
        .onConflictDoUpdate({
          target: [
            pullCounters.repositoryId,
            pullCounters.scope,
            pullCounters.imageName,
            pullCounters.tagReference,
          ],
          set: { count: sql`${pullCounters.count} + 1` },
        });
    }

    if (increments.image) {
      await tx
        .insert(pullCounters)
        .values({
          repositoryId: repository.id,
          scope: "image",
          imageName: input.imageName,
          tagReference: "",
          count: 1,
        })
        .onConflictDoUpdate({
          target: [
            pullCounters.repositoryId,
            pullCounters.scope,
            pullCounters.imageName,
            pullCounters.tagReference,
          ],
          set: { count: sql`${pullCounters.count} + 1` },
        });
    }

    if (increments.repository) {
      await tx
        .insert(pullCounters)
        .values({
          repositoryId: repository.id,
          scope: "repository",
          imageName: "",
          tagReference: "",
          count: 1,
        })
        .onConflictDoUpdate({
          target: [
            pullCounters.repositoryId,
            pullCounters.scope,
            pullCounters.imageName,
            pullCounters.tagReference,
          ],
          set: { count: sql`${pullCounters.count} + 1` },
        });
    }
  });
}

export function schedulePullEventRecording(input: RecordPullEventInput): void {
  void recordPullEvent(input).catch((error) => {
    console.error("Failed to record pull event", error);
  });
}
