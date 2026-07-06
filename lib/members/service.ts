// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { and, eq, isNull } from "drizzle-orm";

import { writeAuditLog } from "@/lib/audit/log";
import { findUserByEmail } from "@/lib/auth/credentials";
import { getDb } from "@/lib/db";
import {
  projectInvites,
  projectMembers,
  projects,
  users,
} from "@/lib/db/schema";
import { canPerformProjectAction } from "@/lib/rbac/check";
import { getProjectMemberRole } from "@/lib/rbac/roles";
import type { ProjectRole, SystemRole } from "@/lib/rbac/types";

export type MemberListEntry =
  | {
      type: "user";
      userId: string;
      email: string;
      name: string;
      role: ProjectRole;
      joinedAt: string;
    }
  | {
      type: "invite";
      inviteId: string;
      email: string;
      role: ProjectRole;
      invitedAt: string;
    };

export async function listProjectMembers(
  projectId: string,
  userId: string,
  systemRole: SystemRole,
): Promise<MemberListEntry[] | { error: "not_found" | "forbidden" }> {
  const db = getDb();
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!project) {
    return { error: "not_found" };
  }

  const memberRole = await getProjectMemberRole(userId, projectId);
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
      role: projectMembers.role,
      joinedAt: projectMembers.createdAt,
    })
    .from(projectMembers)
    .innerJoin(users, eq(projectMembers.userId, users.id))
    .where(eq(projectMembers.projectId, projectId));

  const inviteRows = await db
    .select({
      inviteId: projectInvites.id,
      email: projectInvites.email,
      role: projectInvites.role,
      invitedAt: projectInvites.createdAt,
    })
    .from(projectInvites)
    .where(
      and(
        eq(projectInvites.projectId, projectId),
        isNull(projectInvites.acceptedAt),
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
  projectId: string,
  actorId: string,
  systemRole: SystemRole,
  input: { email: string; role: ProjectRole },
): Promise<
  | { type: "user"; userId: string; email: string; role: ProjectRole }
  | { type: "invite"; inviteId: string; email: string; role: ProjectRole }
  | { error: "not_found" | "forbidden" | "invalid_role" | "already_member" }
> {
  const db = getDb();
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!project) {
    return { error: "not_found" };
  }

  const actorRole = await getProjectMemberRole(actorId, projectId);
  if (
    !canPerformProjectAction(systemRole, actorRole, "manage_members")
  ) {
    return { error: "forbidden" };
  }

  if (!isValidMemberRole(input.role)) {
    return { error: "invalid_role" };
  }

  const email = input.email.trim().toLowerCase();
  const existingUser = await findUserByEmail(email);

  if (existingUser) {
    const existingRole = await getProjectMemberRole(
      existingUser.id,
      projectId,
    );
    if (existingRole) {
      return { error: "already_member" };
    }

    await db.insert(projectMembers).values({
      projectId,
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
    .select({ id: projectInvites.id })
    .from(projectInvites)
    .where(
      and(
        eq(projectInvites.projectId, projectId),
        eq(projectInvites.email, email),
        isNull(projectInvites.acceptedAt),
      ),
    )
    .limit(1);

  if (pendingInvite) {
    return { error: "already_member" };
  }

  const [invite] = await db
    .insert(projectInvites)
    .values({
      projectId,
      email,
      role: input.role,
      invitedBy: actorId,
    })
    .returning({ id: projectInvites.id });

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

export async function updateProjectMemberRole(
  projectId: string,
  targetUserId: string,
  actorId: string,
  systemRole: SystemRole,
  role: ProjectRole,
): Promise<{ ok: true } | { error: "not_found" | "forbidden" | "invalid_role" }> {
  const db = getDb();
  const [project] = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!project) {
    return { error: "not_found" };
  }

  const actorRole = await getProjectMemberRole(actorId, projectId);
  if (
    !canPerformProjectAction(systemRole, actorRole, "manage_members")
  ) {
    return { error: "forbidden" };
  }

  if (!isValidMemberRole(role)) {
    return { error: "invalid_role" };
  }

  const targetRole = await getProjectMemberRole(targetUserId, projectId);
  if (!targetRole) {
    return { error: "not_found" };
  }

  await db
    .update(projectMembers)
    .set({ role })
    .where(
      and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, targetUserId),
      ),
    );

  await writeAuditLog({
    userId: actorId,
    action: "member.role_change",
    resource: `project:${project.name}/user:${targetUserId}:${targetRole}->${role}`,
  });

  return { ok: true };
}

export async function removeProjectMember(
  projectId: string,
  targetUserId: string,
  actorId: string,
  systemRole: SystemRole,
): Promise<{ ok: true } | { error: "not_found" | "forbidden" }> {
  const db = getDb();
  const [project] = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!project) {
    return { error: "not_found" };
  }

  const actorRole = await getProjectMemberRole(actorId, projectId);
  if (
    !canPerformProjectAction(systemRole, actorRole, "manage_members")
  ) {
    return { error: "forbidden" };
  }

  const targetRole = await getProjectMemberRole(targetUserId, projectId);
  if (!targetRole) {
    return { error: "not_found" };
  }

  await db
    .delete(projectMembers)
    .where(
      and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, targetUserId),
      ),
    );

  await writeAuditLog({
    userId: actorId,
    action: "member.remove",
    resource: `project:${project.name}/user:${targetUserId}:${targetRole}`,
  });

  return { ok: true };
}

export async function removeProjectInvite(
  projectId: string,
  inviteId: string,
  actorId: string,
  systemRole: SystemRole,
): Promise<{ ok: true } | { error: "not_found" | "forbidden" }> {
  const db = getDb();
  const [project] = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!project) {
    return { error: "not_found" };
  }

  const actorRole = await getProjectMemberRole(actorId, projectId);
  if (
    !canPerformProjectAction(systemRole, actorRole, "manage_members")
  ) {
    return { error: "forbidden" };
  }

  const [invite] = await db
    .select({ id: projectInvites.id, email: projectInvites.email })
    .from(projectInvites)
    .where(
      and(
        eq(projectInvites.id, inviteId),
        eq(projectInvites.projectId, projectId),
        isNull(projectInvites.acceptedAt),
      ),
    )
    .limit(1);

  if (!invite) {
    return { error: "not_found" };
  }

  await db.delete(projectInvites).where(eq(projectInvites.id, inviteId));

  await writeAuditLog({
    userId: actorId,
    action: "member.invite_remove",
    resource: `project:${project.name}/invite:${invite.email}`,
  });

  return { ok: true };
}

function isValidMemberRole(role: string): role is ProjectRole {
  return (
    role === "guest" ||
    role === "developer" ||
    role === "maintainer" ||
    role === "admin"
  );
}
