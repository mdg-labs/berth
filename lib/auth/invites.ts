// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { and, eq, isNull } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { projectInvites, projectMembers } from "@/lib/db/schema";

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
    .from(projectInvites)
    .where(
      and(
        eq(projectInvites.email, normalizedEmail),
        isNull(projectInvites.acceptedAt),
      ),
    );

  if (invites.length === 0) {
    return 0;
  }

  let accepted = 0;

  for (const invite of invites) {
    await db
      .insert(projectMembers)
      .values({
        projectId: invite.projectId,
        userId,
        role: invite.role,
      })
      .onConflictDoNothing();

    await db
      .update(projectInvites)
      .set({ acceptedAt: new Date() })
      .where(eq(projectInvites.id, invite.id));

    accepted += 1;
  }

  return accepted;
}
