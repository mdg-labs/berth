// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiError } from "@/lib/api/errors";
import {
  deleteProject,
  getProjectDetail,
  updateProject,
} from "@/lib/projects/service";
import { getSessionUserFromRequest } from "@/lib/session/request";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type UpdateProjectBody = {
  name?: string;
  isPublic?: boolean;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return apiError("not_authenticated", "Not authenticated", 401);
  }

  const { id } = await context.params;
  const project = await getProjectDetail(id, user.id, user.systemRole);

  if (!project) {
    return apiError("not_found", "Project not found", 404);
  }

  return NextResponse.json({ project });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return apiError("not_authenticated", "Not authenticated", 401);
  }

  const { id } = await context.params;

  let body: UpdateProjectBody;
  try {
    body = (await request.json()) as UpdateProjectBody;
  } catch {
    return apiError("bad_request", "Invalid JSON body", 400);
  }

  const result = await updateProject(id, user.id, user.systemRole, body);

  if ("error" in result) {
    if (result.error === "not_found") {
      return apiError("not_found", "Project not found", 404);
    }
    if (result.error === "forbidden") {
      return apiError("forbidden", "Insufficient permissions", 403);
    }
    if (result.error === "invalid_name") {
      return apiError("bad_request", "Invalid project name", 400);
    }
    return apiError("conflict", "Project name already exists", 409);
  }

  return NextResponse.json({ project: result });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return apiError("not_authenticated", "Not authenticated", 401);
  }

  const { id } = await context.params;
  const force = request.nextUrl.searchParams.get("force") === "true";

  const result = await deleteProject(id, user.id, user.systemRole, { force });

  if ("error" in result) {
    if (result.error === "not_found") {
      return apiError("not_found", "Project not found", 404);
    }
    if (result.error === "forbidden") {
      return apiError("forbidden", "Insufficient permissions", 403);
    }
    return NextResponse.json(
      {
        error: {
          code: "conflict",
          message: "Project has non-empty repositories",
          repos: result.repos,
        },
      },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true });
}
