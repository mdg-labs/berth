// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import {
  issueRepositoriesRegistryToken,
  type RegistryAuthUser,
} from "@/lib/registry/client/auth";
import { registryFetch, registryJson } from "@/lib/registry/client/fetch";

async function fetchCatalogRepositories(token: string): Promise<string[]> {
  try {
    const body = await registryJson<{ repositories?: string[] }>(
      "/v2/_catalog?n=1000",
      token,
    );
    return body.repositories ?? [];
  } catch {
    return [];
  }
}

async function listNonEmptyImagesByRepositories(
  user: RegistryAuthUser,
  repositoryNames: ReadonlySet<string>,
  options?: { actions?: string[] },
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  for (const name of repositoryNames) {
    result.set(name, []);
  }

  if (repositoryNames.size === 0) {
    return result;
  }

  const token = await issueRepositoriesRegistryToken(
    user,
    [...repositoryNames],
    { actions: options?.actions },
  );
  const catalog = await fetchCatalogRepositories(token);

  const candidates: {
    repositoryName: string;
    fullName: string;
    shortName: string;
  }[] = [];

  for (const fullName of catalog) {
    const slashIndex = fullName.indexOf("/");
    if (slashIndex === -1) {
      continue;
    }

    const repositoryName = fullName.slice(0, slashIndex);
    if (!repositoryNames.has(repositoryName)) {
      continue;
    }

    const shortName = fullName.slice(slashIndex + 1);
    if (!shortName) {
      continue;
    }

    candidates.push({ repositoryName, fullName, shortName });
  }

  for (const { repositoryName, fullName, shortName } of candidates) {
    const hasTags = await repositoryHasTags(token, fullName);
    if (hasTags) {
      result.get(repositoryName)!.push(shortName);
    }
  }

  return result;
}

export async function countNonEmptyImagesForRepositories(
  user: RegistryAuthUser,
  repositoryNames: string[],
): Promise<Map<string, number>> {
  const imagesByRepository = await listNonEmptyImagesByRepositories(
    user,
    new Set(repositoryNames),
  );

  return new Map(
    repositoryNames.map((name) => [name, imagesByRepository.get(name)?.length ?? 0]),
  );
}

export async function listNonEmptyImagesInRepository(
  user: RegistryAuthUser,
  repositoryName: string,
): Promise<string[]> {
  const imagesByRepository = await listNonEmptyImagesByRepositories(
    user,
    new Set([repositoryName]),
  );
  return imagesByRepository.get(repositoryName) ?? [];
}

async function repositoryHasTags(
  token: string,
  repository: string,
): Promise<boolean> {
  try {
    const body = await registryJson<{ tags?: string[] }>(
      `/v2/${repository}/tags/list?n=1`,
      token,
    );
    return (body.tags?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

export async function deleteAllImagesInRepository(
  user: RegistryAuthUser,
  repositoryName: string,
): Promise<void> {
  const repos = await listNonEmptyImagesInRepository(user, repositoryName);
  const token = await issueRepositoriesRegistryToken(user, [repositoryName], {
    actions: ["pull", "delete"],
  });

  for (const shortName of repos) {
    await deleteImage(token, `${repositoryName}/${shortName}`);
  }
}

async function deleteImage(token: string, repository: string): Promise<void> {
  let tags: string[] = [];

  try {
    const body = await registryJson<{ tags?: string[] }>(
      `/v2/${repository}/tags/list?n=1000`,
      token,
    );
    tags = body.tags ?? [];
  } catch {
    return;
  }

  for (const tag of tags) {
    await deleteManifest(token, repository, tag);
  }
}

async function deleteManifest(
  token: string,
  repository: string,
  tag: string,
): Promise<void> {
  try {
    const headResponse = await registryFetch(
      `/v2/${repository}/manifests/${tag}`,
      token,
      {
        method: "HEAD",
        headers: {
          Accept:
            "application/vnd.docker.distribution.manifest.v2+json, application/vnd.oci.image.manifest.v1+json",
        },
      },
    );

    if (!headResponse.ok) {
      return;
    }

    const digest = headResponse.headers.get("docker-content-digest");
    if (!digest) {
      return;
    }

    await registryFetch(`/v2/${repository}/manifests/${digest}`, token, {
      method: "DELETE",
    });
  } catch {
    // Best-effort cascade during force delete.
  }
}
