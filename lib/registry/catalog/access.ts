// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { apiError } from "@/lib/api/errors";
import { getRepositoryDetail, type RepositoryDetail } from "@/lib/repositories/service";
import { RegistryAccessError } from "@/lib/registry/client/auth";
import { RegistryUpstreamError } from "@/lib/registry/client/fetch";
import { getSessionUserFromRequest } from "@/lib/session/request";
import type { NextRequest } from "next/server";
import type { NextResponse } from "next/server";

type CatalogAuthUser = {
  id: string;
  email: string;
  systemRole: "admin" | "user";
};

type RepositoryAccessResult =
  | { error: NextResponse }
  | { user: CatalogAuthUser; repository: RepositoryDetail };

export async function requireCatalogUser(request: NextRequest): Promise<
  | { error: NextResponse }
  | { user: CatalogAuthUser }
> {
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return { error: apiError("not_authenticated", "Not authenticated", 401) };
  }
  return {
    user: {
      id: user.id,
      email: user.email,
      systemRole: user.systemRole,
    },
  };
}

export async function requireRepositoryAccess(
  request: NextRequest,
  repositoryId: string,
): Promise<RepositoryAccessResult> {
  const auth = await requireCatalogUser(request);
  if ("error" in auth) {
    return auth;
  }

  const repository = await getRepositoryDetail(repositoryId, auth.user);

  if (!repository) {
    return { error: apiError("not_found", "Repository not found", 404) };
  }

  return {
    user: {
      id: auth.user.id,
      email: auth.user.email,
      systemRole: auth.user.systemRole,
    },
    repository,
  };
}

export function joinImageName(segments: string[]): string {
  return segments.map(decodeURIComponent).join("/");
}

export function handleRegistryRouteError(error: unknown) {
  if (error instanceof RegistryAccessError) {
    if (error.code === "repository_not_found") {
      return apiError("repository_not_found", error.message, 403);
    }
    return apiError("forbidden", error.message, 403);
  }

  if (error instanceof RegistryUpstreamError) {
    if (error.status === 404) {
      return apiError("not_found", "Registry resource not found", 404);
    }
    return apiError("server_error", error.message, error.status >= 500 ? 502 : 400);
  }

  return apiError("server_error", "Registry request failed", 500);
}
