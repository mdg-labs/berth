// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

export const MFA_PENDING_COOKIE = "berth_mfa_pending";
export const MFA_PENDING_TTL_SECONDS = 300;
export const MFA_BACKUP_CODE_COUNT = 10;
export const MFA_TOTP_EPOCH_TOLERANCE = 30;

export function getMfaIssuer(): string {
  const appUrl = process.env.APP_URL?.trim() || "http://localhost:8080";
  try {
    return new URL(appUrl).hostname || "Berth";
  } catch {
    return "Berth";
  }
}
