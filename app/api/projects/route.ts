// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiError } from "@/lib/api/errors";
import { createProject, listProjectsForUser } from "@/lib/projects/service";
import { getSessionUserFromRequest } from "@/lib/session/request";

type CreateProjectBody = {
  name?: string;
  isPublic?: boolean;
};

export async function GET(request: NextRequest) {
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return apiError("not_authenticated", "Not authenticated", 401);
  }

  const projects = await listProjectsForUser(user.id, user.systemRole);
  return NextResponse.json({ projects });
}

export async function POST(request: NextRequest) {
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return apiError("not_authenticated", "Not authenticated", 401);
  }

  let body: CreateProjectBody;
  try {
    body = (await request.json()) as CreateProjectBody;
  } catch {
    return apiError("bad_request", "Invalid JSON body", 400);
  }

  if (!body.name?.trim()) {
    return apiError("bad_request", "Project name is required", 400);
  }

  const result = await createProject(user.id, {
    name: body.name,
    isPublic: body.isPublic,
  });

  if ("error" in result) {
    if (result.error === "invalid_name") {
      return apiError(
        "bad_request",
        "Project name must be a DNS-like slug (lowercase letters, numbers, hyphens)",
        400,
      );
    }

    return apiError("conflict", "Project name already exists", 409);
  }

  return NextResponse.json({ project: result }, { status: 201 });
}
