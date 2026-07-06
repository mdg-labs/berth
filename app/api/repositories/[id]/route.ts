// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiError } from "@/lib/api/errors";
import {
  deleteRepository,
  getRepositoryDetail,
  updateRepository,
} from "@/lib/repositories/service";
import { getSessionUserFromRequest } from "@/lib/session/request";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type UpdateRepositoryBody = {
  name?: string;
  isPublic?: boolean;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return apiError("not_authenticated", "Not authenticated", 401);
  }

  const { id } = await context.params;
  const repository = await getRepositoryDetail(id, {
    id: user.id,
    email: user.email,
    systemRole: user.systemRole,
  });

  if (!repository) {
    return apiError("not_found", "Repository not found", 404);
  }

  return NextResponse.json({ repository });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return apiError("not_authenticated", "Not authenticated", 401);
  }

  const { id } = await context.params;

  let body: UpdateRepositoryBody;
  try {
    body = (await request.json()) as UpdateRepositoryBody;
  } catch {
    return apiError("bad_request", "Invalid JSON body", 400);
  }

  const result = await updateRepository(
    id,
    {
      id: user.id,
      email: user.email,
      systemRole: user.systemRole,
    },
    body,
  );

  if ("error" in result) {
    if (result.error === "not_found") {
      return apiError("not_found", "Repository not found", 404);
    }
    if (result.error === "forbidden") {
      return apiError("forbidden", "Insufficient permissions", 403);
    }
    if (result.error === "invalid_name") {
      return apiError("bad_request", "Invalid repository name", 400);
    }
    return apiError("conflict", "Repository name already exists", 409);
  }

  return NextResponse.json({ repository: result });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return apiError("not_authenticated", "Not authenticated", 401);
  }

  const { id } = await context.params;
  const force = request.nextUrl.searchParams.get("force") === "true";

  const result = await deleteRepository(
    id,
    {
      id: user.id,
      email: user.email,
      systemRole: user.systemRole,
    },
    { force },
  );

  if ("error" in result) {
    if (result.error === "not_found") {
      return apiError("not_found", "Repository not found", 404);
    }
    if (result.error === "forbidden") {
      return apiError("forbidden", "Insufficient permissions", 403);
    }
    return NextResponse.json(
      {
        error: {
          code: "conflict",
          message: "Repository has non-empty images",
          images: result.images,
        },
      },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true });
}
