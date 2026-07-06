// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { authorizeTokenAccess } from "@/lib/token/authorize";
import { getTokenService } from "@/lib/token/config";
import { issueRegistryToken } from "@/lib/token/issue";
import type { RegistryAccess } from "@/lib/token/scope";

import type { RegistryAuthUser } from "./auth";
import { RegistryAccessError } from "./auth";

export async function issueUserRegistryDeleteToken(
  user: RegistryAuthUser,
  projectName: string,
  repoName: string,
): Promise<string> {
  const access: RegistryAccess[] = [
    {
      type: "repository",
      name: `${projectName}/${repoName}`,
      actions: ["pull", "delete"],
    },
  ];

  const authorized = await authorizeTokenAccess(user, access);

  if (!authorized.ok) {
    throw new RegistryAccessError(authorized.code, authorized.message);
  }

  const issued = await issueRegistryToken(
    user.email,
    getTokenService(),
    authorized.access,
  );

  return issued.token;
}
