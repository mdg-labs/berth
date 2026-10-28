// Copyright (c) 2026 Michael David Guggenbichler (MDG Labs), licensed under Apache-2.0 — see LICENSE

export type ResettableExpiry = {
  createdAt: Date | string;
  expiresAt: Date | string | null;
  expiryLifetimeSeconds: number | null;
};

function toMs(value: Date | string): number {
  return new Date(value).getTime();
}

/**
 * The lifetime a reset expiry grants, in milliseconds, or null when the
 * credential never expires. A row with an expiry and no stored lifetime falls
 * back to `expiresAt - createdAt`.
 */
export function resetExpiryLifetimeMs(
  credential: ResettableExpiry,
): number | null {
  if (credential.expiresAt === null) {
    return null;
  }
  const ttlMs =
    credential.expiryLifetimeSeconds !== null
      ? credential.expiryLifetimeSeconds * 1000
      : toMs(credential.expiresAt) - toMs(credential.createdAt);
  return Math.max(ttlMs, 0);
}

/** The expiry a reset would set at `nowMs`, or null for a never-expiring credential. */
export function previewResetExpiry(
  credential: ResettableExpiry,
  nowMs: number,
): Date | null {
  const ttlMs = resetExpiryLifetimeMs(credential);
  return ttlMs === null ? null : new Date(nowMs + ttlMs);
}
