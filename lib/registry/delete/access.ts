// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { apiError } from "@/lib/api/errors";
import { canPerformRepositoryAction } from "@/lib/rbac/check";
import {
  requireRepositoryAccess,
} from "@/lib/registry/catalog/access";
import type { NextRequest } from "next/server";
import type { NextResponse } from "next/server";

type DeleteAccessResult =
  | { error: NextResponse }
  | {
      user: {
        id: string;
        email: string;
        systemRole: "admin" | "user";
      };
      repository: { id: string; name: string; role: "guest" | "developer" | "maintainer" | "admin" | null };
    };

export async function requireDeleteAccess(
  request: NextRequest,
  repositoryId: string,
): Promise<DeleteAccessResult> {
  const access = await requireRepositoryAccess(request, repositoryId);
  if ("error" in access) {
    return access;
  }

  if (
    !canPerformRepositoryAction(
      access.user.systemRole,
      access.repository.role,
      "delete",
    )
  ) {
    return {
      error: apiError(
        "forbidden",
        "Insufficient permissions to delete registry content",
        403,
      ),
    };
  }

  return access;
}
