// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { and, eq, isNull } from "drizzle-orm";

import { writeAuditLog } from "@/lib/audit/log";
import { getDb } from "@/lib/db";
import { repositoryInvites, repositoryMembers, repositories } from "@/lib/db/schema";

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

    const [repository] = await db
      .select({ name: repositories.name })
      .from(repositories)
      .where(eq(repositories.id, invite.repositoryId))
      .limit(1);

    await writeAuditLog({
      userId,
      action: "member.invite_accept",
      resource: `repository:${repository?.name ?? invite.repositoryId}/user:${normalizedEmail}:${invite.role}`,
      repositoryId: invite.repositoryId,
    });

    accepted += 1;
  }

  return accepted;
}
