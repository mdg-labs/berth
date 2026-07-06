// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { listRepositoryCatalog } from "@/lib/registry/client/catalog";
import {
  handleRegistryRouteError,
  requireRepositoryAccess,
} from "@/lib/registry/catalog/access";
import { enrichImagesWithVisibility } from "@/lib/repositories/settings";
import {
  getImagePullCounts,
  getRepositoryPullCount,
} from "@/lib/pulls/stats";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const access = await requireRepositoryAccess(request, id);
  if ("error" in access) {
    return access.error;
  }

  const search = request.nextUrl.searchParams.get("search") ?? undefined;

  try {
    const catalog = await listRepositoryCatalog(
      access.user,
      access.repository.name,
      search,
    );
    const images = await enrichImagesWithVisibility(
      access.repository.id,
      access.repository.isPublic,
      catalog.images,
    );
    const [repositoryPullCount, imagePullCounts] = await Promise.all([
      getRepositoryPullCount(access.repository.id),
      getImagePullCounts(
        access.repository.id,
        images.map((image) => image.name),
      ),
    ]);

    return NextResponse.json({
      images: images.map((image) => ({
        ...image,
        pullCount: imagePullCounts.get(image.name) ?? 0,
      })),
      repositoryPullCount,
    });
  } catch (error) {
    return handleRegistryRouteError(error);
  }
}
