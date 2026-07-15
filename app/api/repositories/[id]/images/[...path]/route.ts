// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiError } from "@/lib/api/errors";
import { listRepositoryCatalog } from "@/lib/registry/client/catalog";
import { requireDeleteAccess } from "@/lib/registry/delete/access";
import {
  bulkDeleteTags,
  deleteImage,
  deleteManifestDigest,
  deleteTag,
  type BulkDeleteItem,
} from "@/lib/registry/delete/service";
import { isDigestReference } from "@/lib/catalog/format";
import {
  getTagDetail,
  getTagSiblings,
  listImageTags,
} from "@/lib/registry/client/tags";
import {
  handleRegistryRouteError,
  joinImageName,
  requireRepositoryAccess,
} from "@/lib/registry/catalog/access";
import {
  parseImageApiPath,
  parseImageDeletePath,
} from "@/lib/registry/catalog/parse-path";
import { GC_INFO_MESSAGE } from "@/lib/registry/delete/constants";
import {
  getTagPullCounts,
  pullCountKeysForTags,
  resolveTagPullCount,
} from "@/lib/pulls/stats";
import {
  getImageSettings,
  upsertImageSettings,
} from "@/lib/repositories/settings";
import type { AnonymousPullOverride } from "@/lib/images/types";
import { getSessionUserFromRequest } from "@/lib/session/request";

type RouteContext = {
  params: Promise<{ id: string; path: string[] }>;
};

type UpdateImageSettingsBody = {
  anonymousPull?: AnonymousPullOverride;
};

const VALID_OVERRIDES = new Set<AnonymousPullOverride>([
  "inherit",
  "allow",
  "deny",
]);

function parseSettingsPath(
  path: string[],
): { imageName: string } | null {
  if (path.length < 2 || path.at(-1) !== "settings") {
    return null;
  }

  return { imageName: joinImageName(path.slice(0, -1)) };
}

async function imageExistsInCatalog(
  user: { id: string; email: string; systemRole: "admin" | "user" },
  repositoryName: string,
  imageName: string,
): Promise<boolean> {
  const catalog = await listRepositoryCatalog(user, repositoryName);
  return catalog.images.some((repo) => repo.name === imageName);
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { id, path } = await context.params;
  const access = await requireRepositoryAccess(request, id);
  if ("error" in access) {
    return access.error;
  }

  const settingsPath = parseSettingsPath(path);
  if (settingsPath) {
    try {
      const result = await getImageSettings(
        id,
        settingsPath.imageName,
        access.user.id,
        access.user.systemRole,
      );

      if ("error" in result) {
        if (result.error === "not_found") {
          return apiError("not_found", "Repository not found", 404);
        }
        return apiError("forbidden", "Insufficient permissions", 403);
      }

      return NextResponse.json({ settings: result });
    } catch (error) {
      return handleRegistryRouteError(error);
    }
  }

  const parsed = parseImageApiPath(path);
  if (!parsed) {
    return apiError("bad_request", "Invalid image API path", 400);
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
      const includeUntagged = params.get("includeUntagged") === "true";

      const tags = await listImageTags(
        access.user,
        access.repository.name,
        parsed.imageName,
        {
          search: params.get("search") ?? undefined,
          sort,
          page: Number.isFinite(page) ? page : 1,
          pageSize: Number.isFinite(pageSize) ? pageSize : 25,
          includeUntagged,
        },
      );

      const pullCounts = await getTagPullCounts(
        access.repository.id,
        parsed.imageName,
        pullCountKeysForTags(tags.tags),
      );

      return NextResponse.json({
        ...tags,
        tags: tags.tags.map((tag) => ({
          ...tag,
          pullCount: resolveTagPullCount(tag, pullCounts),
        })),
      });
    }

    if (parsed.kind === "tag-detail") {
      const detail = await getTagDetail(
        access.user,
        access.repository.name,
        parsed.imageName,
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
        access.repository.name,
        parsed.imageName,
        parsed.tag,
      );
      return NextResponse.json(siblings);
    }

    return apiError("bad_request", "Invalid image API path", 400);
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

  const tagParsed = parseImageApiPath(path);
  if (tagParsed?.kind === "tag-detail") {
    try {
      if (isDigestReference(tagParsed.tag)) {
        const result = await deleteManifestDigest(
          access.user,
          access.repository.name,
          tagParsed.imageName,
          tagParsed.tag,
        );

        return NextResponse.json({
          deleted: true,
          digest: result.digest,
          gcInfo: GC_INFO_MESSAGE,
        });
      }

      const result = await deleteTag(
        access.user,
        access.repository.name,
        tagParsed.imageName,
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

  const repoParsed = parseImageDeletePath(path);
  if (!repoParsed) {
    return apiError("bad_request", "Invalid image API path", 400);
  }

  try {
    const result = await deleteImage(
      access.user,
      access.repository.name,
      repoParsed.imageName,
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

export async function PATCH(request: NextRequest, context: RouteContext) {
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return apiError("not_authenticated", "Not authenticated", 401);
  }

  const { id, path } = await context.params;
  const access = await requireRepositoryAccess(request, id);
  if ("error" in access) {
    return access.error;
  }

  const settingsPath = parseSettingsPath(path);
  if (!settingsPath) {
    return apiError("bad_request", "Invalid image settings API path", 400);
  }

  let body: UpdateImageSettingsBody;
  try {
    body = (await request.json()) as UpdateImageSettingsBody;
  } catch {
    return apiError("bad_request", "Invalid JSON body", 400);
  }

  if (!body.anonymousPull || !VALID_OVERRIDES.has(body.anonymousPull)) {
    return apiError("bad_request", "Invalid anonymous pull setting", 400);
  }

  try {
    const exists = await imageExistsInCatalog(
      access.user,
      access.repository.name,
      settingsPath.imageName,
    );

    if (!exists) {
      return apiError("not_found", "Image not found", 404);
    }

    const result = await upsertImageSettings(
      user.id,
      id,
      settingsPath.imageName,
      body.anonymousPull,
      user.id,
      user.systemRole,
    );

    if ("error" in result) {
      if (result.error === "not_found") {
        return apiError("not_found", "Repository not found", 404);
      }
      if (result.error === "forbidden") {
        return apiError("forbidden", "Insufficient permissions", 403);
      }
      return apiError("bad_request", "Invalid image name", 400);
    }

    return NextResponse.json({ settings: result });
  } catch (error) {
    return handleRegistryRouteError(error);
  }
}

type BulkDeleteBody = {
  tags?: string[] | BulkDeleteItem[];
};

function normalizeBulkDeleteItems(
  tags: string[] | BulkDeleteItem[],
): BulkDeleteItem[] {
  if (tags.length === 0) {
    return [];
  }

  if (typeof tags[0] === "string") {
    return (tags as string[]).map((name) => ({ name }));
  }

  return tags as BulkDeleteItem[];
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id, path } = await context.params;
  const access = await requireDeleteAccess(request, id);
  if ("error" in access) {
    return access.error;
  }

  const parsed = parseImageApiPath(path);
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
    const items = normalizeBulkDeleteItems(body.tags);
    const result = await bulkDeleteTags(
      access.user,
      access.repository.name,
      parsed.imageName,
      items,
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
