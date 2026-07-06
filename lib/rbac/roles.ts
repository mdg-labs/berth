// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { projectMembers, projects } from "@/lib/db/schema";

import type { ProjectRole, SystemRole } from "./types";

export type ProjectContext = {
  id: string;
  name: string;
  isPublic: boolean;
};

export async function getProjectById(
  projectId: string,
): Promise<ProjectContext | null> {
  const db = getDb();
  const [row] = await db
    .select({
      id: projects.id,
      name: projects.name,
      isPublic: projects.isPublic,
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  return row ?? null;
}

export async function getProjectByName(
  projectName: string,
): Promise<ProjectContext | null> {
  const db = getDb();
  const [row] = await db
    .select({
      id: projects.id,
      name: projects.name,
      isPublic: projects.isPublic,
    })
    .from(projects)
    .where(eq(projects.name, projectName))
    .limit(1);

  return row ?? null;
}

export async function getProjectMemberRole(
  userId: string,
  projectId: string,
): Promise<ProjectRole | null> {
  const db = getDb();
  const [row] = await db
    .select({ role: projectMembers.role })
    .from(projectMembers)
    .where(
      and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, userId),
      ),
    )
    .limit(1);

  return row?.role ?? null;
}

export async function getEffectiveProjectRole(
  userId: string,
  systemRole: SystemRole,
  project: ProjectContext,
): Promise<ProjectRole | "bypass" | null> {
  if (systemRole === "admin") {
    return "bypass";
  }

  const memberRole = await getProjectMemberRole(userId, project.id);
  if (memberRole) {
    return memberRole;
  }

  if (project.isPublic) {
    return "guest";
  }

  return null;
}
