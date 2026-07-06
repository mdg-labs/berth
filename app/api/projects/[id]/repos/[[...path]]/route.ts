// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiError } from "@/lib/api/errors";
import { requireDeleteAccess } from "@/lib/registry/delete/access";
import {
  bulkDeleteTags,
  deleteRepository,
  deleteTag,
} from "@/lib/registry/delete/service";
import {
  getTagDetail,
  getTagSiblings,
  listRepositoryTags,
} from "@/lib/registry/client/tags";
import {
  handleRegistryRouteError,
  requireProjectAccess,
} from "@/lib/registry/catalog/access";
import {
  parseRepoApiPath,
  parseRepoDeletePath,
} from "@/lib/registry/catalog/parse-path";
import { GC_INFO_MESSAGE } from "@/lib/registry/delete/constants";

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

    if (parsed.kind === "tag-siblings") {
      const siblings = await getTagSiblings(
        access.user,
        access.project.name,
        parsed.repoName,
        parsed.tag,
      );
      return NextResponse.json(siblings);
    }

    return apiError("bad_request", "Invalid repository API path", 400);
  } catch (error) {
    return handleRegistryRouteError(error);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { id, path } = await context.params;
  const access = await requireDeleteAccess(request, id);
  if ("error" in access) {
    return access.error;
  }

  const tagParsed = parseRepoApiPath(path);
  if (tagParsed?.kind === "tag-detail") {
    try {
      const result = await deleteTag(
        access.user,
        access.project.name,
        tagParsed.repoName,
        tagParsed.tag,
      );

      return NextResponse.json({
        deleted: true,
        tag: result.tag,
        siblings: result.siblings,
        gcInfo: GC_INFO_MESSAGE,
      });
    } catch (error) {
      return handleRegistryRouteError(error);
    }
  }

  const repoParsed = parseRepoDeletePath(path);
  if (!repoParsed) {
    return apiError("bad_request", "Invalid repository API path", 400);
  }

  try {
    const result = await deleteRepository(
      access.user,
      access.project.name,
      repoParsed.repoName,
    );

    return NextResponse.json({
      deleted: true,
      deletedTags: result.deletedTags,
      deletedDigests: result.deletedDigests,
      gcInfo: GC_INFO_MESSAGE,
    });
  } catch (error) {
    return handleRegistryRouteError(error);
  }
}

type BulkDeleteBody = {
  tags?: string[];
};

export async function POST(request: NextRequest, context: RouteContext) {
  const { id, path } = await context.params;
  const access = await requireDeleteAccess(request, id);
  if ("error" in access) {
    return access.error;
  }

  const parsed = parseRepoApiPath(path);
  if (!parsed || parsed.kind !== "bulk-delete") {
    return apiError("bad_request", "Invalid bulk-delete API path", 400);
  }

  let body: BulkDeleteBody;
  try {
    body = (await request.json()) as BulkDeleteBody;
  } catch {
    return apiError("bad_request", "Invalid JSON body", 400);
  }

  if (!Array.isArray(body.tags) || body.tags.length === 0) {
    return apiError("bad_request", "At least one tag is required", 400);
  }

  try {
    const result = await bulkDeleteTags(
      access.user,
      access.project.name,
      parsed.repoName,
      body.tags,
    );

    return NextResponse.json({
      deleted: true,
      deletedTags: result.deletedTags,
      deletedDigests: result.deletedDigests,
      gcInfo: GC_INFO_MESSAGE,
    });
  } catch (error) {
    return handleRegistryRouteError(error);
  }
}
