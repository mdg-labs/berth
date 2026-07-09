// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { createHmac, timingSafeEqual } from "node:crypto";

import { MFA_PENDING_COOKIE, MFA_PENDING_TTL_SECONDS } from "./config";
import { getMfaPendingCookieValue } from "./cookie";

export type MfaPendingState = {
  userId: string;
  exp: number;
};

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

export function encodeMfaPendingState(state: MfaPendingState): string {
  const payload = Buffer.from(JSON.stringify(state)).toString("base64url");
  const signature = signPayload(payload);
  return `${payload}.${signature}`;
}

export function decodeMfaPendingState(value: string): MfaPendingState | null {
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
    const state = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as MfaPendingState;

    if (!state.userId || typeof state.exp !== "number") {
      return null;
    }

    if (state.exp <= Date.now()) {
      return null;
    }

    return state;
  } catch {
    return null;
  }
}

export function createMfaPendingState(userId: string): MfaPendingState {
  return {
    userId,
    exp: Date.now() + MFA_PENDING_TTL_SECONDS * 1000,
  };
}

function cookieSecure(): boolean {
  return (process.env.APP_URL ?? "http://localhost:8080").startsWith("https://");
}

export function buildMfaPendingCookie(value: string): string {
  const parts = [
    `${MFA_PENDING_COOKIE}=${encodeURIComponent(value)}`,
    "HttpOnly",
    "Path=/",
    `Max-Age=${MFA_PENDING_TTL_SECONDS}`,
    "SameSite=Lax",
  ];

  if (cookieSecure()) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

export function buildClearMfaPendingCookie(): string {
  const parts = [
    `${MFA_PENDING_COOKIE}=`,
    "HttpOnly",
    "Path=/",
    "Max-Age=0",
    "SameSite=Lax",
  ];

  if (cookieSecure()) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

export function getMfaPendingStateFromCookie(
  cookieHeader: string | null,
): MfaPendingState | null {
  const value = getMfaPendingCookieValue(cookieHeader);
  if (!value) {
    return null;
  }

  return decodeMfaPendingState(value);
}

export function hasMfaPendingCookie(cookieHeader: string | null): boolean {
  return getMfaPendingStateFromCookie(cookieHeader) !== null;
}
