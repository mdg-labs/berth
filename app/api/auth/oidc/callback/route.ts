// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiError } from "@/lib/api/errors";
import { acceptPendingInvitesForEmail } from "@/lib/auth/invites";
import { upsertOidcUser } from "@/lib/auth/oidc-user";
import { getOidcConfiguration, oidcClient } from "@/lib/oidc/client";
import {
  getAppUrl,
  getOidcIssuer,
  isOidcConfigured,
} from "@/lib/oidc/config";
import {
  buildClearOidcStateCookie,
  getOidcFlowStateFromCookie,
} from "@/lib/oidc/state";
import { buildSessionCookie } from "@/lib/session/cookie";
import { createSession } from "@/lib/session/store";

function claimString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function claimBoolean(value: unknown): boolean {
  return value === true;
}

export async function GET(request: NextRequest) {
  if (!isOidcConfigured()) {
    return apiError("oidc_not_configured", "OIDC is not configured", 404);
  }

  const flowState = getOidcFlowStateFromCookie(request.headers.get("cookie"));
  if (!flowState) {
    return apiError("oidc_state_invalid", "OIDC state is missing or invalid", 400);
  }

  const callbackUrl = new URL(request.url);
  const returnedState = callbackUrl.searchParams.get("state");
  if (!returnedState || returnedState !== flowState.state) {
    return apiError("oidc_state_invalid", "OIDC state mismatch", 400);
  }

  const config = await getOidcConfiguration();

  let tokenSet;
  try {
    tokenSet = await oidcClient.authorizationCodeGrant(config, callbackUrl, {
      pkceCodeVerifier: flowState.codeVerifier,
      expectedState: flowState.state,
      expectedNonce: flowState.nonce,
    });
  } catch {
    return apiError("oidc_state_invalid", "OIDC authorization failed", 400);
  }

  const claims = tokenSet.claims();
  const email = claimString(claims?.email);
  const sub = claimString(claims?.sub);
  const name =
    claimString(claims?.name) ?? claimString(claims?.preferred_username) ?? email;

  if (!email || !sub || !name) {
    return apiError("bad_request", "OIDC token is missing required claims", 400);
  }

  const emailVerified = claimBoolean(claims?.email_verified);

  const user = await upsertOidcUser({
    issuer: getOidcIssuer(),
    sub,
    email,
    name,
    emailVerified,
  });

  await acceptPendingInvitesForEmail(user.id, user.email, {
    requireEmailVerified: true,
    emailVerified,
  });

  const sessionId = await createSession(user.id);

  const response = NextResponse.redirect(new URL("/", getAppUrl()));
  response.headers.append("Set-Cookie", buildSessionCookie(sessionId));
  response.headers.append("Set-Cookie", buildClearOidcStateCookie());
  return response;
}
