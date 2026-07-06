// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

export function formatBytes(bytes: number): string {
  if (bytes <= 0) {
    return "—";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

export function formatDigest(digest: string): string {
  if (!digest) {
    return "—";
  }
  if (digest.length <= 19) {
    return digest;
  }
  return `${digest.slice(0, 12)}…${digest.slice(-7)}`;
}

export function buildPullCommand(host: string, project: string, repo: string, tag: string): string {
  const registryHost = host.replace(/^https?:\/\//, "");
  return `docker pull ${registryHost}/${project}/${repo}:${tag}`;
}

export function repoPathSegments(repoPath: string): string {
  return repoPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}
