// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { createHash, randomBytes } from "node:crypto";

export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function getExpiryFromHours(hours: number): Date {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

export function isTokenExpired(expiresAt: Date): boolean {
  return expiresAt.getTime() <= Date.now();
}
