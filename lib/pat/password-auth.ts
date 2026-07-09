// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { getUserMfaEnabledAt } from "@/lib/mfa/store";

/** Returns whether password-based registry auth is allowed for this user. */
export async function isPasswordAuthAllowedForUser(user: {
  id: string;
  email: string;
}): Promise<boolean> {
  const enabledAt = await getUserMfaEnabledAt(user.id);
  return enabledAt === null;
}
