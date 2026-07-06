// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

export function parseRepositoryCatalogEntry(
  fullName: string,
  repositoryNames: ReadonlySet<string>,
): { repositoryName: string; shortName: string } | null {
  for (const repositoryName of repositoryNames) {
    const prefix = `${repositoryName}/`;
    if (!fullName.startsWith(prefix)) {
      continue;
    }

    const shortName = fullName.slice(prefix.length);
    if (!shortName) {
      continue;
    }

    return { repositoryName, shortName };
  }

  return null;
}
