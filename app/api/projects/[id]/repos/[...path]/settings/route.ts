// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiError } from "@/lib/api/errors";
import { listProjectCatalog } from "@/lib/registry/client/catalog";
import {
  getRepositorySettings,
  upsertRepositorySettings,
} from "@/lib/repositories/settings";
import type { AnonymousPullOverride } from "@/lib/repositories/types";
import {
  handleRegistryRouteError,
  joinRepoName,
  requireProjectAccess,
} from "@/lib/registry/catalog/access";
import { getSessionUserFromRequest } from "@/lib/session/request";

type RouteContext = {
  params: Promise<{ id: string; path?: string[] }>;
};

type UpdateRepositorySettingsBody = {
  anonymousPull?: AnonymousPullOverride;
};

const VALID_OVERRIDES = new Set<AnonymousPullOverride>([
  "inherit",
  "allow",
  "deny",
]);

async function repositoryExistsInCatalog(
  user: { id: string; email: string; systemRole: "admin" | "user" },
  projectName: string,
  repoName: string,
): Promise<boolean> {
  const catalog = await listProjectCatalog(user, projectName);
  return catalog.repositories.some((repo) => repo.name === repoName);
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { id, path } = await context.params;
  const access = await requireProjectAccess(request, id);
  if ("error" in access) {
    return access.error;
  }

  if (!path || path.length === 0) {
    return apiError("bad_request", "Repository name is required", 400);
  }

  const repoName = joinRepoName(path);

  try {
    const result = await getRepositorySettings(
      id,
      repoName,
      access.user.id,
      access.user.systemRole,
    );

    if ("error" in result) {
      if (result.error === "not_found") {
        return apiError("not_found", "Project not found", 404);
      }
      return apiError("forbidden", "Insufficient permissions", 403);
    }

    return NextResponse.json({ settings: result });
  } catch (error) {
    return handleRegistryRouteError(error);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return apiError("not_authenticated", "Not authenticated", 401);
  }

  const { id, path } = await context.params;
  const access = await requireProjectAccess(request, id);
  if ("error" in access) {
    return access.error;
  }

  if (!path || path.length === 0) {
    return apiError("bad_request", "Repository name is required", 400);
  }

  const repoName = joinRepoName(path);

  let body: UpdateRepositorySettingsBody;
  try {
    body = (await request.json()) as UpdateRepositorySettingsBody;
  } catch {
    return apiError("bad_request", "Invalid JSON body", 400);
  }

  if (!body.anonymousPull || !VALID_OVERRIDES.has(body.anonymousPull)) {
    return apiError("bad_request", "Invalid anonymous pull setting", 400);
  }

  try {
    const exists = await repositoryExistsInCatalog(
      access.user,
      access.project.name,
      repoName,
    );

    if (!exists) {
      return apiError("not_found", "Repository not found", 404);
    }

    const result = await upsertRepositorySettings(
      user.id,
      id,
      repoName,
      body.anonymousPull,
      user.id,
      user.systemRole,
    );

    if ("error" in result) {
      if (result.error === "not_found") {
        return apiError("not_found", "Project not found", 404);
      }
      if (result.error === "forbidden") {
        return apiError("forbidden", "Insufficient permissions", 403);
      }
      return apiError("bad_request", "Invalid repository name", 400);
    }

    return NextResponse.json({ settings: result });
  } catch (error) {
    return handleRegistryRouteError(error);
  }
}
