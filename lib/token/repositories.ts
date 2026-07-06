// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { eq, inArray } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { repositories } from "@/lib/db/schema";

import { extractRepositoryNames, type RegistryAccess } from "./scope";

export async function findMissingRepositories(
  access: RegistryAccess[],
): Promise<string[]> {
  const repositoryNames = extractRepositoryNames(access);
  if (repositoryNames.length === 0) {
    return [];
  }

  const db = getDb();
  const rows = await db
    .select({ name: repositories.name })
    .from(repositories)
    .where(inArray(repositories.name, repositoryNames));

  const existing = new Set(rows.map((row) => row.name));
  return repositoryNames.filter((name) => !existing.has(name));
}

export async function repositoryExists(repositoryName: string): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ name: repositories.name })
    .from(repositories)
    .where(eq(repositories.name, repositoryName))
    .limit(1);

  return Boolean(row);
}
