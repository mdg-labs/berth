// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiError } from "@/lib/api/errors";
import { getPublicImageTags } from "@/lib/public/image-tags";
import { parsePublicImageTagsPath } from "@/lib/public/parse-path";
import { handleRegistryRouteError } from "@/lib/registry/catalog/access";

type RouteContext = {
  params: Promise<{ repository: string; path: string[] }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const { repository, path } = await context.params;
  const repositoryName = decodeURIComponent(repository);
  const parsed = parsePublicImageTagsPath(path);

  if (!parsed) {
    return apiError("not_found", "Image not found", 404);
  }

  try {
    const result = await getPublicImageTags(repositoryName, parsed.imageName);

    if (!result) {
      return apiError("not_found", "Image not found", 404);
    }

    return NextResponse.json(result);
  } catch (error) {
    return handleRegistryRouteError(error);
  }
}
