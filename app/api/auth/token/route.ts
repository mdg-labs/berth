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
import { PAT_PREFIX } from "@/lib/pat/config";
import { isPasswordAuthAllowedForUser } from "@/lib/pat/password-auth";
import {
  recordPatUsageAudit,
  resolvePersonalAccessToken,
  touchPersonalAccessTokenLastUsed,
} from "@/lib/pat/store";
import type { PatContext } from "@/lib/pat/types";
import { checkTokenRateLimit } from "@/lib/rate-limit/token";
import { getSessionUserFromRequest } from "@/lib/session/request";
import { authorizeTokenAccess } from "@/lib/token/authorize";
import { getTokenService } from "@/lib/token/config";
import { issueRegistryToken } from "@/lib/token/issue";
import { parseScopes } from "@/lib/token/scope";

type TokenIdentity = {
  subject: string;
  rateLimitKey: string;
  user: {
    id: string;
    email: string;
    systemRole: "admin" | "user";
  };
  pat?: PatContext;
  patLastUsedAt?: Date | null;
};

async function resolveIdentity(
  request: NextRequest,
): Promise<TokenIdentity | null> {
  const basic = parseBasicAuth(request.headers.get("authorization"));
  if (basic) {
    if (basic.password.startsWith(PAT_PREFIX)) {
      const resolved = await resolvePersonalAccessToken(basic.password);
      if (resolved) {
        return {
          subject: resolved.user.email,
          rateLimitKey: `pat:${resolved.pat.id}`,
          user: resolved.user,
          pat: resolved.pat,
          patLastUsedAt: resolved.lastUsedAt,
        };
      }
      return null;
    }

    const user = await findUserByEmail(basic.username);
    if (
      user &&
      (await isPasswordAuthAllowedForUser(user)) &&
      (await verifyPassword(user.passwordHash, basic.password))
    ) {
      return {
        subject: user.email,
        rateLimitKey: user.email,
        user: {
          id: user.id,
          email: user.email,
          systemRole: user.systemRole,
        },
      };
    }

    const resolvedPat = await resolvePersonalAccessToken(basic.password);
    if (resolvedPat) {
      return {
        subject: resolvedPat.user.email,
        rateLimitKey: `pat:${resolvedPat.pat.id}`,
        user: resolvedPat.user,
        pat: resolvedPat.pat,
        patLastUsedAt: resolvedPat.lastUsedAt,
      };
    }

    return null;
  }

  const sessionUser = await getSessionUserFromRequest(request);
  if (!sessionUser) {
    return null;
  }

  return {
    subject: sessionUser.email,
    rateLimitKey: sessionUser.email,
    user: {
      id: sessionUser.id,
      email: sessionUser.email,
      systemRole: sessionUser.systemRole,
    },
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

  const access = parseScopes(scopeParam);
  const identity = await resolveIdentity(request);

  if (!identity) {
    if (access.length === 0) {
      return apiError("not_authenticated", "Authentication required", 401);
    }

    if (!checkTokenRateLimit(clientIp, "unauthenticated")) {
      return apiError("rate_limited", "Too many token requests", 429);
    }

    const authorized = await authorizeTokenAccess(null, access);
    if (!authorized.ok) {
      if (authorized.code === "repository_not_found") {
        return apiError("repository_not_found", authorized.message, 403);
      }
      return apiError("forbidden", authorized.message, 403);
    }

    const issued = await issueRegistryToken(
      "anonymous",
      service,
      authorized.access,
    );

    return NextResponse.json({
      token: issued.token,
      access_token: issued.token,
      expires_in: issued.expiresIn,
      issued_at: issued.issuedAt,
    });
  }

  if (!checkTokenRateLimit(clientIp, identity.rateLimitKey)) {
    return apiError("rate_limited", "Too many token requests", 429);
  }

  const authorized = await authorizeTokenAccess(
    identity.user,
    access,
    identity.pat,
  );
  if (!authorized.ok) {
    if (authorized.code === "repository_not_found") {
      return apiError("repository_not_found", authorized.message, 403);
    }
    return apiError("forbidden", authorized.message, 403);
  }

  if (identity.pat) {
    void touchPersonalAccessTokenLastUsed(
      identity.pat.id,
      identity.patLastUsedAt ?? null,
    );
    void recordPatUsageAudit(identity.user.id, identity.pat.id, clientIp);
  }

  const issued = await issueRegistryToken(
    identity.subject,
    service,
    authorized.access,
  );

  return NextResponse.json({
    token: issued.token,
    access_token: issued.token,
    expires_in: issued.expiresIn,
    issued_at: issued.issuedAt,
  });
}
