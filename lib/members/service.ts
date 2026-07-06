// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { and, eq, isNull } from "drizzle-orm";

import { writeAuditLog } from "@/lib/audit/log";
import { findUserByEmail } from "@/lib/auth/credentials";
import { getDb } from "@/lib/db";
import {
  repositoryInvites,
  repositoryMembers,
  repositories,
  users,
} from "@/lib/db/schema";
import { canPerformRepositoryAction } from "@/lib/rbac/check";
import { getRepositoryMemberRole } from "@/lib/rbac/roles";
import type { RepositoryRole, SystemRole } from "@/lib/rbac/types";

export type MemberListEntry =
  | {
      type: "user";
      userId: string;
      email: string;
      name: string;
      role: RepositoryRole;
      joinedAt: string;
    }
  | {
      type: "invite";
      inviteId: string;
      email: string;
      role: RepositoryRole;
      invitedAt: string;
    };

export async function listProjectMembers(
  repositoryId: string,
  userId: string,
  systemRole: SystemRole,
): Promise<MemberListEntry[] | { error: "not_found" | "forbidden" }> {
  const db = getDb();
  const [project] = await db
    .select({ id: repositories.id })
    .from(repositories)
    .where(eq(repositories.id, repositoryId))
    .limit(1);

  if (!project) {
    return { error: "not_found" };
  }

  const memberRole = await getRepositoryMemberRole(userId, repositoryId);
  const canView =
    systemRole === "admin" || memberRole !== null;

  if (!canView) {
    return { error: "forbidden" };
  }

  const memberRows = await db
    .select({
      userId: users.id,
      email: users.email,
      name: users.name,
      role: repositoryMembers.role,
      joinedAt: repositoryMembers.createdAt,
    })
    .from(repositoryMembers)
    .innerJoin(users, eq(repositoryMembers.userId, users.id))
    .where(eq(repositoryMembers.repositoryId, repositoryId));

  const inviteRows = await db
    .select({
      inviteId: repositoryInvites.id,
      email: repositoryInvites.email,
      role: repositoryInvites.role,
      invitedAt: repositoryInvites.createdAt,
    })
    .from(repositoryInvites)
    .where(
      and(
        eq(repositoryInvites.repositoryId, repositoryId),
        isNull(repositoryInvites.acceptedAt),
      ),
    );

  const entries: MemberListEntry[] = [
    ...memberRows.map((row) => ({
      type: "user" as const,
      userId: row.userId,
      email: row.email,
      name: row.name,
      role: row.role,
      joinedAt: row.joinedAt.toISOString(),
    })),
    ...inviteRows.map((row) => ({
      type: "invite" as const,
      inviteId: row.inviteId,
      email: row.email,
      role: row.role,
      invitedAt: row.invitedAt.toISOString(),
    })),
  ];

  entries.sort((a, b) => a.email.localeCompare(b.email));
  return entries;
}

export async function addProjectMember(
  repositoryId: string,
  actorId: string,
  systemRole: SystemRole,
  input: { email: string; role: RepositoryRole },
): Promise<
  | { type: "user"; userId: string; email: string; role: RepositoryRole }
  | { type: "invite"; inviteId: string; email: string; role: RepositoryRole }
  | { error: "not_found" | "forbidden" | "invalid_role" | "already_member" }
> {
  const db = getDb();
  const [project] = await db
    .select({ id: repositories.id })
    .from(repositories)
    .where(eq(repositories.id, repositoryId))
    .limit(1);

  if (!project) {
    return { error: "not_found" };
  }

  const actorRole = await getRepositoryMemberRole(actorId, repositoryId);
  if (
    !canPerformRepositoryAction(systemRole, actorRole, "manage_members")
  ) {
    return { error: "forbidden" };
  }

  if (!isValidMemberRole(input.role)) {
    return { error: "invalid_role" };
  }

  const email = input.email.trim().toLowerCase();
  const existingUser = await findUserByEmail(email);

  if (existingUser) {
    const existingRole = await getRepositoryMemberRole(
      existingUser.id,
      repositoryId,
    );
    if (existingRole) {
      return { error: "already_member" };
    }

    await db.insert(repositoryMembers).values({
      repositoryId,
      userId: existingUser.id,
      role: input.role,
    });

    return {
      type: "user",
      userId: existingUser.id,
      email: existingUser.email,
      role: input.role,
    };
  }

  const [pendingInvite] = await db
    .select({ id: repositoryInvites.id })
    .from(repositoryInvites)
    .where(
      and(
        eq(repositoryInvites.repositoryId, repositoryId),
        eq(repositoryInvites.email, email),
        isNull(repositoryInvites.acceptedAt),
      ),
    )
    .limit(1);

  if (pendingInvite) {
    return { error: "already_member" };
  }

  const [invite] = await db
    .insert(repositoryInvites)
    .values({
      repositoryId,
      email,
      role: input.role,
      invitedBy: actorId,
    })
    .returning({ id: repositoryInvites.id });

  if (!invite) {
    throw new Error("Failed to create invite");
  }

  return {
    type: "invite",
    inviteId: invite.id,
    email,
    role: input.role,
  };
}

export async function updateRepositoryMemberRole(
  repositoryId: string,
  targetUserId: string,
  actorId: string,
  systemRole: SystemRole,
  role: RepositoryRole,
): Promise<{ ok: true } | { error: "not_found" | "forbidden" | "invalid_role" }> {
  const db = getDb();
  const [project] = await db
    .select({ id: repositories.id, name: repositories.name })
    .from(repositories)
    .where(eq(repositories.id, repositoryId))
    .limit(1);

  if (!project) {
    return { error: "not_found" };
  }

  const actorRole = await getRepositoryMemberRole(actorId, repositoryId);
  if (
    !canPerformRepositoryAction(systemRole, actorRole, "manage_members")
  ) {
    return { error: "forbidden" };
  }

  if (!isValidMemberRole(role)) {
    return { error: "invalid_role" };
  }

  const targetRole = await getRepositoryMemberRole(targetUserId, repositoryId);
  if (!targetRole) {
    return { error: "not_found" };
  }

  await db
    .update(repositoryMembers)
    .set({ role })
    .where(
      and(
        eq(repositoryMembers.repositoryId, repositoryId),
        eq(repositoryMembers.userId, targetUserId),
      ),
    );

  await writeAuditLog({
    userId: actorId,
    action: "member.role_change",
    resource: `repository:${project.name}/user:${targetUserId}:${targetRole}->${role}`,
  });

  return { ok: true };
}

export async function removeProjectMember(
  repositoryId: string,
  targetUserId: string,
  actorId: string,
  systemRole: SystemRole,
): Promise<{ ok: true } | { error: "not_found" | "forbidden" }> {
  const db = getDb();
  const [project] = await db
    .select({ id: repositories.id, name: repositories.name })
    .from(repositories)
    .where(eq(repositories.id, repositoryId))
    .limit(1);

  if (!project) {
    return { error: "not_found" };
  }

  const actorRole = await getRepositoryMemberRole(actorId, repositoryId);
  if (
    !canPerformRepositoryAction(systemRole, actorRole, "manage_members")
  ) {
    return { error: "forbidden" };
  }

  const targetRole = await getRepositoryMemberRole(targetUserId, repositoryId);
  if (!targetRole) {
    return { error: "not_found" };
  }

  await db
    .delete(repositoryMembers)
    .where(
      and(
        eq(repositoryMembers.repositoryId, repositoryId),
        eq(repositoryMembers.userId, targetUserId),
      ),
    );

  await writeAuditLog({
    userId: actorId,
    action: "member.remove",
    resource: `repository:${project.name}/user:${targetUserId}:${targetRole}`,
  });

  return { ok: true };
}

export async function removeProjectInvite(
  repositoryId: string,
  inviteId: string,
  actorId: string,
  systemRole: SystemRole,
): Promise<{ ok: true } | { error: "not_found" | "forbidden" }> {
  const db = getDb();
  const [project] = await db
    .select({ id: repositories.id, name: repositories.name })
    .from(repositories)
    .where(eq(repositories.id, repositoryId))
    .limit(1);

  if (!project) {
    return { error: "not_found" };
  }

  const actorRole = await getRepositoryMemberRole(actorId, repositoryId);
  if (
    !canPerformRepositoryAction(systemRole, actorRole, "manage_members")
  ) {
    return { error: "forbidden" };
  }

  const [invite] = await db
    .select({ id: repositoryInvites.id, email: repositoryInvites.email })
    .from(repositoryInvites)
    .where(
      and(
        eq(repositoryInvites.id, inviteId),
        eq(repositoryInvites.repositoryId, repositoryId),
        isNull(repositoryInvites.acceptedAt),
      ),
    )
    .limit(1);

  if (!invite) {
    return { error: "not_found" };
  }

  await db.delete(repositoryInvites).where(eq(repositoryInvites.id, inviteId));

  await writeAuditLog({
    userId: actorId,
    action: "member.invite_remove",
    resource: `repository:${project.name}/invite:${invite.email}`,
  });

  return { ok: true };
}

function isValidMemberRole(role: string): role is RepositoryRole {
  return (
    role === "guest" ||
    role === "developer" ||
    role === "maintainer" ||
    role === "admin"
  );
}
