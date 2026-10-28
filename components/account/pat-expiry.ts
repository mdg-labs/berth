// Copyright (c) 2026 Michael David Guggenbichler (MDG Labs), licensed under Apache-2.0 — see LICENSE

const DAY_MS = 24 * 60 * 60 * 1000;

export function latestPatExpiryDate(
  nowMs: number,
  maxValidityDays: number,
): string {
  return new Date(nowMs + maxValidityDays * DAY_MS).toISOString().slice(0, 10);
}

export function resolvePatExpiry(
  date: string,
  nowMs: number,
  maxValidityDays: number | null,
): string {
  const endOfDayMs = new Date(`${date}T23:59:59.999Z`).getTime();
  if (maxValidityDays === null) {
    return new Date(endOfDayMs).toISOString();
  }
  return new Date(
    Math.min(endOfDayMs, nowMs + maxValidityDays * DAY_MS),
  ).toISOString();
}
