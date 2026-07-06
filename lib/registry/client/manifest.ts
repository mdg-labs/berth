// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import type { HistoryEntry, PlatformInfo } from "./types";
import { registryFetch } from "./fetch";

const MANIFEST_ACCEPT =
  "application/vnd.docker.distribution.manifest.v2+json, " +
  "application/vnd.docker.distribution.manifest.list.v2+json, " +
  "application/vnd.oci.image.manifest.v1+json, " +
  "application/vnd.oci.image.index.v1+json";

type ManifestDescriptor = {
  mediaType?: string;
  digest: string;
  size: number;
  platform?: {
    os?: string;
    architecture?: string;
    variant?: string;
  };
};

type ManifestList = {
  mediaType: string;
  manifests: ManifestDescriptor[];
};

type ImageManifest = {
  mediaType: string;
  config?: ManifestDescriptor;
  layers?: ManifestDescriptor[];
};

type ImageConfig = {
  created?: string;
  author?: string;
  config?: {
    Labels?: Record<string, string>;
  };
  history?: {
    created?: string;
    created_by?: string;
    comment?: string;
    empty_layer?: boolean;
  }[];
};

export type ResolvedManifest = {
  digest: string;
  mediaType: string;
  size: number;
  platforms: PlatformInfo[];
  history: HistoryEntry[];
  labels: Record<string, string>;
};

export async function resolveManifest(
  fullRepoName: string,
  tag: string,
  token: string,
): Promise<ResolvedManifest> {
  const headResponse = await registryFetch(
    `/v2/${fullRepoName}/manifests/${encodeURIComponent(tag)}`,
    token,
    {
      method: "HEAD",
      headers: { Accept: MANIFEST_ACCEPT },
    },
  );

  if (!headResponse.ok) {
    throw new Error(`Manifest not found: ${headResponse.status}`);
  }

  const digest = headResponse.headers.get("docker-content-digest");
  const contentType = headResponse.headers.get("content-type") ?? "";
  const contentLength = Number.parseInt(
    headResponse.headers.get("content-length") ?? "0",
    10,
  );

  if (!digest) {
    throw new Error("Missing docker-content-digest header");
  }

  const getResponse = await registryFetch(
    `/v2/${fullRepoName}/manifests/${digest}`,
    token,
    {
      headers: { Accept: MANIFEST_ACCEPT },
    },
  );

  if (!getResponse.ok) {
    throw new Error(`Failed to fetch manifest: ${getResponse.status}`);
  }

  const manifest = (await getResponse.json()) as ManifestList | ImageManifest;
  const mediaType = manifest.mediaType || contentType;

  if (isManifestList(mediaType)) {
    return resolveManifestList(digest, mediaType, manifest as ManifestList, contentLength);
  }

  return resolveImageManifest(
    fullRepoName,
    digest,
    mediaType,
    manifest as ImageManifest,
    token,
    contentLength,
  );
}

function isManifestList(mediaType: string): boolean {
  return (
    mediaType.includes("manifest.list") || mediaType.includes("image.index")
  );
}

function resolveManifestList(
  digest: string,
  mediaType: string,
  manifest: ManifestList,
  size: number,
): ResolvedManifest {
  const platforms: PlatformInfo[] = (manifest.manifests ?? []).map((entry) => ({
    os: entry.platform?.os ?? "unknown",
    architecture: entry.platform?.architecture ?? "unknown",
    variant: entry.platform?.variant,
    digest: entry.digest,
    size: entry.size,
  }));

  return {
    digest,
    mediaType,
    size,
    platforms,
    history: [],
    labels: {},
  };
}

async function resolveImageManifest(
  fullRepoName: string,
  digest: string,
  mediaType: string,
  manifest: ImageManifest,
  token: string,
  size: number,
): Promise<ResolvedManifest> {
  const layers = manifest.layers ?? [];
  const totalSize =
    size > 0
      ? size
      : layers.reduce((sum, layer) => sum + layer.size, 0) +
        (manifest.config?.size ?? 0);

  let history: HistoryEntry[] = [];
  let labels: Record<string, string> = {};

  if (manifest.config?.digest) {
    const config = await fetchConfigBlob(
      fullRepoName,
      manifest.config.digest,
      token,
    );
    if (config) {
      history = parseHistory(config);
      labels = config.config?.Labels ?? {};
    }
  }

  return {
    digest,
    mediaType,
    size: totalSize,
    platforms: [],
    history,
    labels,
  };
}

async function fetchConfigBlob(
  fullRepoName: string,
  digest: string,
  token: string,
): Promise<ImageConfig | null> {
  const response = await registryFetch(
    `/v2/${fullRepoName}/blobs/${digest}`,
    token,
  );

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as ImageConfig;
}

function parseHistory(config: ImageConfig): HistoryEntry[] {
  return (config.history ?? []).map((entry) => ({
    created: entry.created ?? config.created ?? "",
    createdBy: entry.created_by ?? config.author ?? "",
    comment: entry.comment ?? "",
    emptyLayer: entry.empty_layer ?? false,
  }));
}

export async function getManifestDigest(
  fullRepoName: string,
  tag: string,
  token: string,
): Promise<{ digest: string; size: number } | null> {
  const response = await registryFetch(
    `/v2/${fullRepoName}/manifests/${encodeURIComponent(tag)}`,
    token,
    {
      method: "HEAD",
      headers: { Accept: MANIFEST_ACCEPT },
    },
  );

  if (!response.ok) {
    return null;
  }

  const digest = response.headers.get("docker-content-digest");
  const size = Number.parseInt(
    response.headers.get("content-length") ?? "0",
    10,
  );

  if (!digest) {
    return null;
  }

  return { digest, size };
}
