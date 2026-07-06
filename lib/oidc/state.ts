// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { createHmac, timingSafeEqual } from "node:crypto";

import type { OidcFlowState } from "./config";
import { OIDC_STATE_COOKIE } from "./config";

const STATE_TTL_SECONDS = 600;

function getStateSecret(): string {
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret) {
    throw new Error("SESSION_SECRET is required");
  }
  return secret;
}

function signPayload(payload: string): string {
  return createHmac("sha256", getStateSecret()).update(payload).digest("base64url");
}

export function encodeOidcFlowState(state: OidcFlowState): string {
  const payload = Buffer.from(JSON.stringify(state)).toString("base64url");
  const signature = signPayload(payload);
  return `${payload}.${signature}`;
}

export function decodeOidcFlowState(value: string): OidcFlowState | null {
  const [payload, signature] = value.split(".");
  if (!payload || !signature) {
    return null;
  }

  const expected = signPayload(payload);
  const actual = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (
    actual.length !== expectedBuffer.length ||
    !timingSafeEqual(actual, expectedBuffer)
  ) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as OidcFlowState;
  } catch {
    return null;
  }
}

export function buildOidcStateCookie(value: string): string {
  const parts = [
    `${OIDC_STATE_COOKIE}=${encodeURIComponent(value)}`,
    "HttpOnly",
    "Path=/api/auth/oidc",
    `Max-Age=${STATE_TTL_SECONDS}`,
    "SameSite=Lax",
  ];

  const appUrl = process.env.APP_URL ?? "http://localhost:8080";
  if (appUrl.startsWith("https://")) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

export function buildClearOidcStateCookie(): string {
  return `${OIDC_STATE_COOKIE}=; HttpOnly; Path=/api/auth/oidc; Max-Age=0; SameSite=Lax`;
}

export function getOidcFlowStateFromCookie(
  cookieHeader: string | null,
): OidcFlowState | null {
  if (!cookieHeader) {
    return null;
  }

  for (const part of cookieHeader.split(";")) {
    const [name, ...valueParts] = part.trim().split("=");
    if (name === OIDC_STATE_COOKIE) {
      const value = valueParts.join("=");
      if (!value) {
        return null;
      }
      return decodeOidcFlowState(decodeURIComponent(value));
    }
  }

  return null;
}
