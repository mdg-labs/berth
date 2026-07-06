// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { listRepositoryCatalog } from "@/lib/registry/client/catalog";
import { issueRepositoriesRegistryToken, type RegistryAuthUser } from "@/lib/registry/client/auth";
import { registryFetch } from "@/lib/registry/client/fetch";
import { fetchAllTagNames } from "@/lib/registry/client/tag-names";

export async function countNonEmptyImagesForRepositories(
  user: RegistryAuthUser,
  repositoryNames: string[],
): Promise<Map<string, number>> {
  const counts = new Map(repositoryNames.map((name) => [name, 0]));

  await Promise.all(
    repositoryNames.map(async (repositoryName) => {
      try {
        const catalog = await listRepositoryCatalog(user, repositoryName);
        counts.set(repositoryName, catalog.images.length);
      } catch {
        // Registry unreachable or forbidden — leave at 0.
      }
    }),
  );

  return counts;
}

export async function listNonEmptyImagesInRepository(
  user: RegistryAuthUser,
  repositoryName: string,
): Promise<string[]> {
  try {
    const catalog = await listRepositoryCatalog(user, repositoryName);
    return catalog.images.map((image) => image.name);
  } catch {
    return [];
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
    tags = await fetchAllTagNames(repository, token);
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
