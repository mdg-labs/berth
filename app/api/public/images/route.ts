// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { listPublicImages } from "@/lib/public/images";
import { handleRegistryRouteError } from "@/lib/registry/catalog/access";

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams.get("search") ?? undefined;

  try {
    const result = await listPublicImages(search);
    return NextResponse.json(result);
  } catch (error) {
    return handleRegistryRouteError(error);
  }
}
