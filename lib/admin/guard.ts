// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { isSystemAdmin } from "@/lib/rbac/check";
import type { SessionUser } from "@/lib/session/store";

export function isSessionSystemAdmin(
  user: SessionUser | null,
): user is SessionUser & { systemRole: "admin" } {
  return user !== null && isSystemAdmin(user.systemRole);
}
