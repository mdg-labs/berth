// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import {
  computePurgesAt,
  isPendingDeletion,
} from "@/lib/users/config";

export type UserDeletionState = {
  status: "active" | "pending_deletion";
  deletedAt: string | null;
  purgesAt: string | null;
  pendingDeletion: boolean;
};

export function getUserDeletionState(
  deletedAt: Date | null | undefined,
): UserDeletionState {
  if (!deletedAt || !isPendingDeletion(deletedAt)) {
    return {
      status: "active",
      deletedAt: null,
      purgesAt: null,
      pendingDeletion: false,
    };
  }

  const purgesAt = computePurgesAt(deletedAt);

  return {
    status: "pending_deletion",
    deletedAt: deletedAt.toISOString(),
    purgesAt: purgesAt?.toISOString() ?? null,
    pendingDeletion: true,
  };
}

export function formatDeletionCountdown(purgesAt: string | null): string {
  if (!purgesAt) {
    return "Pending deletion";
  }

  const remainingMs = new Date(purgesAt).getTime() - Date.now();
  if (remainingMs <= 0) {
    return "Deleting soon";
  }

  const days = Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
  if (days <= 1) {
    return "Deletes in 1 day";
  }

  return `Deletes in ${days} days`;
}
