// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { listProjectCatalog } from "@/lib/registry/client/catalog";
import {
  handleRegistryRouteError,
  requireProjectAccess,
} from "@/lib/registry/catalog/access";
import { enrichRepositoriesWithVisibility } from "@/lib/repositories/settings";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const access = await requireProjectAccess(request, id);
  if ("error" in access) {
    return access.error;
  }

  const search = request.nextUrl.searchParams.get("search") ?? undefined;

  try {
    const catalog = await listProjectCatalog(
      access.user,
      access.project.name,
      search,
    );
    const repositories = await enrichRepositoriesWithVisibility(
      access.project.id,
      access.project.isPublic,
      catalog.repositories,
    );
    return NextResponse.json({ repositories });
  } catch (error) {
    return handleRegistryRouteError(error);
  }
}
