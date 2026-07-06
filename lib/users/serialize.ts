// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import type { AccountUser } from "@/lib/users/account";
import type { SessionUser } from "@/lib/session/store";

export function toAuthUser(
  user: SessionUser | AccountUser,
): {
  id: string;
  email: string;
  name: string;
  systemRole: "admin" | "user";
  mustChangePassword: boolean;
  hasPassword: boolean;
  pendingDeletion: boolean;
  deletedAt: string | null;
  purgesAt: string | null;
} {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    systemRole: user.systemRole,
    mustChangePassword: user.mustChangePassword,
    hasPassword: user.hasPassword,
    pendingDeletion: user.pendingDeletion,
    deletedAt: user.deletedAt,
    purgesAt: user.purgesAt,
  };
}
