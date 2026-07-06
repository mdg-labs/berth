// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiError } from "@/lib/api/errors";
import { parseBasicAuth } from "@/lib/auth/basic";
import {
  findUserByEmail,
  getClientIp,
  verifyPassword,
} from "@/lib/auth/credentials";
import { checkTokenRateLimit } from "@/lib/rate-limit/token";
import { getSessionUserFromRequest } from "@/lib/session/request";
import { getTokenService } from "@/lib/token/config";
import { issueRegistryToken } from "@/lib/token/issue";
import { findMissingProjects } from "@/lib/token/projects";
import { parseScopes } from "@/lib/token/scope";

type TokenIdentity = {
  subject: string;
  rateLimitKey: string;
};

async function resolveIdentity(
  request: NextRequest,
): Promise<TokenIdentity | null> {
  const basic = parseBasicAuth(request.headers.get("authorization"));
  if (basic) {
    const user = await findUserByEmail(basic.username);
    if (!user || !(await verifyPassword(user.passwordHash, basic.password))) {
      return null;
    }

    return {
      subject: user.email,
      rateLimitKey: user.email,
    };
  }

  const sessionUser = await getSessionUserFromRequest(request);
  if (!sessionUser) {
    return null;
  }

  return {
    subject: sessionUser.email,
    rateLimitKey: sessionUser.email,
  };
}

export async function GET(request: NextRequest) {
  const clientIp = getClientIp(request);
  const service = request.nextUrl.searchParams.get("service")?.trim();
  const scopeParam = request.nextUrl.searchParams.get("scope");

  if (!service) {
    return apiError("bad_request", "Missing required service query parameter", 400);
  }

  const expectedService = getTokenService();
  if (service !== expectedService) {
    return apiError(
      "bad_request",
      `Unsupported service: expected ${expectedService}`,
      400,
    );
  }

  const identity = await resolveIdentity(request);
  if (!identity) {
    if (!checkTokenRateLimit(clientIp, "unauthenticated")) {
      return apiError("rate_limited", "Too many token requests", 429);
    }

    return apiError("not_authenticated", "Authentication required", 401);
  }

  if (!checkTokenRateLimit(clientIp, identity.rateLimitKey)) {
    return apiError("rate_limited", "Too many token requests", 429);
  }

  const access = parseScopes(scopeParam);
  const missingProjects = await findMissingProjects(access);
  if (missingProjects.length > 0) {
    return apiError(
      "project_not_found",
      `Project not found: ${missingProjects.join(", ")}`,
      403,
    );
  }

  const issued = await issueRegistryToken(identity.subject, service, access);

  return NextResponse.json({
    token: issued.token,
    access_token: issued.token,
    expires_in: issued.expiresIn,
    issued_at: issued.issuedAt,
  });
}
