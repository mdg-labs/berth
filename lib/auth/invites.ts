// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { and, eq, isNull } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { repositoryInvites, repositoryMembers } from "@/lib/db/schema";

export async function acceptPendingInvitesForEmail(
  userId: string,
  email: string,
  options: { requireEmailVerified: boolean; emailVerified?: boolean },
): Promise<number> {
  if (options.requireEmailVerified && !options.emailVerified) {
    return 0;
  }

  const db = getDb();
  const normalizedEmail = email.trim().toLowerCase();

  const invites = await db
    .select()
    .from(repositoryInvites)
    .where(
      and(
        eq(repositoryInvites.email, normalizedEmail),
        isNull(repositoryInvites.acceptedAt),
      ),
    );

  if (invites.length === 0) {
    return 0;
  }

  let accepted = 0;

  for (const invite of invites) {
    await db
      .insert(repositoryMembers)
      .values({
        repositoryId: invite.repositoryId,
        userId,
        role: invite.role,
      })
      .onConflictDoNothing();

    await db
      .update(repositoryInvites)
      .set({ acceptedAt: new Date() })
      .where(eq(repositoryInvites.id, invite.id));

    accepted += 1;
  }

  return accepted;
}
