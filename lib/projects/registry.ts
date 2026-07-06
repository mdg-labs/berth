// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { getRegistryInternalUrl } from "@/lib/registry/health";

const CATALOG_TIMEOUT_MS = 10_000;

export async function listNonEmptyReposInProject(
  projectName: string,
): Promise<string[]> {
  const registryUrl = getRegistryInternalUrl().replace(/\/$/, "");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CATALOG_TIMEOUT_MS);

  try {
    const response = await fetch(`${registryUrl}/v2/_catalog?n=1000`, {
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      return [];
    }

    const body = (await response.json()) as { repositories?: string[] };
    const prefix = `${projectName}/`;
    const candidates = (body.repositories ?? []).filter((name) =>
      name.startsWith(prefix),
    );

    const nonEmpty: string[] = [];

    for (const repo of candidates) {
      const hasTags = await repositoryHasTags(registryUrl, repo);
      if (hasTags) {
        nonEmpty.push(repo.slice(prefix.length));
      }
    }

    return nonEmpty;
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

async function repositoryHasTags(
  registryUrl: string,
  repository: string,
): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CATALOG_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${registryUrl}/v2/${repository}/tags/list?n=1`,
      {
        signal: controller.signal,
        cache: "no-store",
      },
    );

    if (!response.ok) {
      return false;
    }

    const body = (await response.json()) as { tags?: string[] };
    return (body.tags?.length ?? 0) > 0;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export async function deleteAllReposInProject(
  projectName: string,
): Promise<void> {
  const registryUrl = getRegistryInternalUrl().replace(/\/$/, "");
  const repos = await listNonEmptyReposInProject(projectName);

  for (const shortName of repos) {
    const fullName = `${projectName}/${shortName}`;
    await deleteRepository(registryUrl, fullName);
  }
}

async function deleteRepository(
  registryUrl: string,
  repository: string,
): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CATALOG_TIMEOUT_MS);

  let tags: string[] = [];

  try {
    const listResponse = await fetch(
      `${registryUrl}/v2/${repository}/tags/list?n=1000`,
      {
        signal: controller.signal,
        cache: "no-store",
      },
    );

    if (!listResponse.ok) {
      return;
    }

    const body = (await listResponse.json()) as { tags?: string[] };
    tags = body.tags ?? [];
  } catch {
    return;
  } finally {
    clearTimeout(timeout);
  }

  for (const tag of tags) {
    await deleteManifest(registryUrl, repository, tag);
  }
}

async function deleteManifest(
  registryUrl: string,
  repository: string,
  tag: string,
): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CATALOG_TIMEOUT_MS);

  try {
    const headResponse = await fetch(
      `${registryUrl}/v2/${repository}/manifests/${tag}`,
      {
        method: "HEAD",
        headers: {
          Accept:
            "application/vnd.docker.distribution.manifest.v2+json, application/vnd.oci.image.manifest.v1+json",
        },
        signal: controller.signal,
        cache: "no-store",
      },
    );

    if (!headResponse.ok) {
      return;
    }

    const digest = headResponse.headers.get("docker-content-digest");
    if (!digest) {
      return;
    }

    await fetch(`${registryUrl}/v2/${repository}/manifests/${digest}`, {
      method: "DELETE",
      signal: controller.signal,
      cache: "no-store",
    });
  } catch {
    // Best-effort cascade during force delete.
  } finally {
    clearTimeout(timeout);
  }
}
