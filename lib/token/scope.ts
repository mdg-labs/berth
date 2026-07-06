// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

export type RegistryAccess = {
  type: string;
  name: string;
  actions: string[];
};

export function parseScopeParam(scopeParam: string | null): string[] {
  if (!scopeParam?.trim()) {
    return [];
  }

  return scopeParam
    .split(/\s+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function parseScopeEntry(scope: string): RegistryAccess | null {
  const firstColon = scope.indexOf(":");
  if (firstColon === -1) {
    return null;
  }

  const type = scope.slice(0, firstColon);
  const remainder = scope.slice(firstColon + 1);
  const lastColon = remainder.lastIndexOf(":");
  if (lastColon === -1) {
    return null;
  }

  const name = remainder.slice(0, lastColon);
  const actionsPart = remainder.slice(lastColon + 1);
  if (!name || !actionsPart) {
    return null;
  }

  const actions = actionsPart
    .split(",")
    .map((action) => action.trim())
    .filter(Boolean);

  if (actions.length === 0) {
    return null;
  }

  return { type, name, actions };
}

export function parseScopes(scopeParam: string | null): RegistryAccess[] {
  const entries = parseScopeParam(scopeParam);
  const access: RegistryAccess[] = [];

  for (const entry of entries) {
    const parsed = parseScopeEntry(entry);
    if (parsed) {
      access.push(parsed);
    }
  }

  return access;
}

export function extractProjectNames(access: RegistryAccess[]): string[] {
  const projects = new Set<string>();

  for (const entry of access) {
    if (entry.type !== "repository") {
      continue;
    }

    const parsed = parseRepositoryScopeName(entry.name);
    if (parsed?.projectName) {
      projects.add(parsed.projectName);
    }
  }

  return [...projects];
}

export function parseRepositoryScopeName(
  fullName: string,
): { projectName: string; repoName: string } | null {
  const slashIndex = fullName.indexOf("/");
  if (slashIndex === -1) {
    return null;
  }

  const projectName = fullName.slice(0, slashIndex);
  const repoName = fullName.slice(slashIndex + 1);

  if (!projectName || !repoName) {
    return null;
  }

  return { projectName, repoName };
}
