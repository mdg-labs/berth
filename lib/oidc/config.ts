// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

export const OIDC_STATE_COOKIE = "berth_oidc_state";

export type OidcFlowState = {
  state: string;
  codeVerifier: string;
  nonce: string;
};

export function getAppUrl(): string {
  return process.env.APP_URL ?? "http://localhost:8080";
}

export function getOidcRedirectUri(): string {
  return `${getAppUrl()}/api/auth/oidc/callback`;
}

export function isOidcConfigured(): boolean {
  return Boolean(
    process.env.OIDC_ISSUER?.trim() &&
      process.env.OIDC_CLIENT_ID?.trim() &&
      process.env.OIDC_CLIENT_SECRET?.trim(),
  );
}

export function getOidcIssuer(): string {
  const issuer = process.env.OIDC_ISSUER?.trim();
  if (!issuer) {
    throw new Error("OIDC_ISSUER is required");
  }
  return issuer;
}

export function getOidcClientId(): string {
  const clientId = process.env.OIDC_CLIENT_ID?.trim();
  if (!clientId) {
    throw new Error("OIDC_CLIENT_ID is required");
  }
  return clientId;
}

export function getOidcClientSecret(): string {
  const clientSecret = process.env.OIDC_CLIENT_SECRET?.trim();
  if (!clientSecret) {
    throw new Error("OIDC_CLIENT_SECRET is required");
  }
  return clientSecret;
}
