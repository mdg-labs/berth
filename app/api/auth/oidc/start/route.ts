// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { NextResponse } from "next/server";

import { apiError } from "@/lib/api/errors";
import { getOidcConfiguration, oidcClient } from "@/lib/oidc/client";
import {
  getOidcRedirectUri,
  isOidcConfigured,
} from "@/lib/oidc/config";
import {
  buildOidcStateCookie,
  encodeOidcFlowState,
} from "@/lib/oidc/state";

export async function GET() {
  if (!isOidcConfigured()) {
    return apiError("oidc_not_configured", "OIDC is not configured", 404);
  }

  const config = await getOidcConfiguration();
  const codeVerifier = oidcClient.randomPKCECodeVerifier();
  const codeChallenge = await oidcClient.calculatePKCECodeChallenge(codeVerifier);
  const state = oidcClient.randomState();
  const nonce = oidcClient.randomNonce();

  const authorizationUrl = oidcClient.buildAuthorizationUrl(config, {
    redirect_uri: getOidcRedirectUri(),
    scope: "openid email profile",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
    nonce,
  });

  const flowState = encodeOidcFlowState({
    state,
    codeVerifier,
    nonce,
  });

  return NextResponse.redirect(authorizationUrl, {
    headers: {
      "Set-Cookie": buildOidcStateCookie(flowState),
    },
  });
}
