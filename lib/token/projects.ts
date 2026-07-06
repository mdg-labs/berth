// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { eq, inArray } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { projects } from "@/lib/db/schema";

import { extractProjectNames, type RegistryAccess } from "./scope";

export async function findMissingProjects(
  access: RegistryAccess[],
): Promise<string[]> {
  const projectNames = extractProjectNames(access);
  if (projectNames.length === 0) {
    return [];
  }

  const db = getDb();
  const rows = await db
    .select({ name: projects.name })
    .from(projects)
    .where(inArray(projects.name, projectNames));

  const existing = new Set(rows.map((row) => row.name));
  return projectNames.filter((name) => !existing.has(name));
}

export async function projectExists(projectName: string): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ name: projects.name })
    .from(projects)
    .where(eq(projects.name, projectName))
    .limit(1);

  return Boolean(row);
}
