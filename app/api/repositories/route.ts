// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiError } from "@/lib/api/errors";
import { createRepository, listRepositoriesForUser } from "@/lib/repositories/service";
import { getSessionUserFromRequest } from "@/lib/session/request";

type CreateRepositoryBody = {
  name?: string;
  isPublic?: boolean;
};

export async function GET(request: NextRequest) {
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return apiError("not_authenticated", "Not authenticated", 401);
  }

  const repositories = await listRepositoriesForUser({
    id: user.id,
    email: user.email,
    systemRole: user.systemRole,
  });
  return NextResponse.json({ repositories });
}

export async function POST(request: NextRequest) {
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return apiError("not_authenticated", "Not authenticated", 401);
  }

  let body: CreateRepositoryBody;
  try {
    body = (await request.json()) as CreateRepositoryBody;
  } catch {
    return apiError("bad_request", "Invalid JSON body", 400);
  }

  if (!body.name?.trim()) {
    return apiError("bad_request", "Repository name is required", 400);
  }

  const result = await createRepository(user.id, {
    name: body.name,
    isPublic: body.isPublic,
  });

  if ("error" in result) {
    if (result.error === "invalid_name") {
      return apiError(
        "bad_request",
        "Repository name must be a DNS-like slug (lowercase letters, numbers, hyphens)",
        400,
      );
    }

    return apiError("conflict", "Repository name already exists", 409);
  }

  return NextResponse.json({ repository: result }, { status: 201 });
}
