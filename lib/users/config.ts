// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

const DEFAULT_USER_DELETE_GRACE_PERIOD_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function getUserDeleteGracePeriodDays(): number {
  const parsed = Number.parseInt(
    process.env.USER_DELETE_GRACE_PERIOD_DAYS ?? "",
    10,
  );

  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_USER_DELETE_GRACE_PERIOD_DAYS;
  }

  return parsed;
}

export function getUserDeleteGracePeriodMs(): number {
  return getUserDeleteGracePeriodDays() * MS_PER_DAY;
}

export function computePurgesAt(deletedAt: Date): Date | null {
  const graceMs = getUserDeleteGracePeriodMs();
  if (graceMs === 0) {
    return deletedAt;
  }

  return new Date(deletedAt.getTime() + graceMs);
}

export function isPastPurgeDeadline(deletedAt: Date, now = new Date()): boolean {
  const purgesAt = computePurgesAt(deletedAt);
  if (!purgesAt) {
    return false;
  }

  return now.getTime() >= purgesAt.getTime();
}

export function isPendingDeletion(
  deletedAt: Date | null | undefined,
  now = new Date(),
): boolean {
  if (!deletedAt) {
    return false;
  }

  return !isPastPurgeDeadline(deletedAt, now);
}
