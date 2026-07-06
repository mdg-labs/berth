// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiError } from "@/lib/api/errors";
import {
  getTagDetail,
  getTagSiblings,
  listRepositoryTags,
} from "@/lib/registry/client/tags";
import {
  handleRegistryRouteError,
  requireProjectAccess,
} from "@/lib/registry/catalog/access";
import { parseRepoApiPath } from "@/lib/registry/catalog/parse-path";

type RouteContext = {
  params: Promise<{ id: string; path?: string[] }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { id, path } = await context.params;
  const access = await requireProjectAccess(request, id);
  if ("error" in access) {
    return access.error;
  }

  const parsed = parseRepoApiPath(path);
  if (!parsed) {
    return apiError("bad_request", "Invalid repository API path", 400);
  }

  try {
    if (parsed.kind === "tags-list") {
      const params = request.nextUrl.searchParams;
      const sortParam = params.get("sort");
      const sort =
        sortParam === "name_desc"
          ? "name_desc"
          : sortParam === "name"
            ? "name"
            : "name";
      const page = Number.parseInt(params.get("page") ?? "1", 10);
      const pageSize = Number.parseInt(params.get("pageSize") ?? "25", 10);

      const tags = await listRepositoryTags(
        access.user,
        access.project.name,
        parsed.repoName,
        {
          search: params.get("search") ?? undefined,
          sort,
          page: Number.isFinite(page) ? page : 1,
          pageSize: Number.isFinite(pageSize) ? pageSize : 25,
        },
      );
      return NextResponse.json(tags);
    }

    if (parsed.kind === "tag-detail") {
      const detail = await getTagDetail(
        access.user,
        access.project.name,
        parsed.repoName,
        parsed.tag,
      );

      if (!detail) {
        return apiError("not_found", "Tag not found", 404);
      }

      return NextResponse.json({ tag: detail });
    }

    const siblings = await getTagSiblings(
      access.user,
      access.project.name,
      parsed.repoName,
      parsed.tag,
    );
    return NextResponse.json(siblings);
  } catch (error) {
    return handleRegistryRouteError(error);
  }
}
