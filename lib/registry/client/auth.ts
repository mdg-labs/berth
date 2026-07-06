// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { authorizeTokenAccess } from "@/lib/token/authorize";
import { getTokenService } from "@/lib/token/config";
import { issueRegistryToken } from "@/lib/token/issue";
import type { RegistryAccess } from "@/lib/token/scope";

export type RegistryAuthUser = {
  id: string;
  email: string;
  systemRole: "admin" | "user";
};

export class RegistryAccessError extends Error {
  readonly code: "forbidden" | "repository_not_found";

  constructor(code: "forbidden" | "repository_not_found", message: string) {
    super(message);
    this.name = "RegistryAccessError";
    this.code = code;
  }
}

function buildAccess(
  repositoryName: string,
  imageName?: string,
  options?: { catalog?: boolean },
): RegistryAccess[] {
  const access: RegistryAccess[] = [];

  if (options?.catalog) {
    access.push({
      type: "registry",
      name: "catalog",
      actions: ["*"],
    });
  }

  const scopeName = imageName
    ? `${repositoryName}/${imageName}`
    : `${repositoryName}/*`;

  access.push({
    type: "repository",
    name: scopeName,
    actions: ["pull"],
  });

  return access;
}

export async function issueUserRegistryToken(
  user: RegistryAuthUser,
  repositoryName: string,
  imageName?: string,
  options?: { catalog?: boolean },
): Promise<string> {
  const access = buildAccess(repositoryName, imageName, options);
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

export async function issueRepositoriesRegistryToken(
  user: RegistryAuthUser,
  repositoryNames: string[],
  options?: { catalog?: boolean; actions?: string[] },
): Promise<string> {
  const actions = options?.actions ?? ["pull"];
  const access: RegistryAccess[] = [];

  if (options?.catalog ?? true) {
    access.push({
      type: "registry",
      name: "catalog",
      actions: ["*"],
    });
  }

  for (const repositoryName of repositoryNames) {
    access.push({
      type: "repository",
      name: `${repositoryName}/*`,
      actions,
    });
  }

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
