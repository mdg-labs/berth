// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

export type ParsedManifestPath = {
  repositoryName: string;
  imageName: string;
  reference: string;
  isDigestReference: boolean;
};

const DIGEST_REFERENCE_PATTERN = /^sha256:[a-f0-9]{64}$/i;

export function isDigestManifestReference(reference: string): boolean {
  return DIGEST_REFERENCE_PATTERN.test(reference);
}

export function parseManifestPath(pathname: string): ParsedManifestPath | null {
  const segments = pathname
    .split("/")
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment));

  if (segments.length < 4 || segments[0] !== "v2") {
    return null;
  }

  const manifestsIndex = segments.lastIndexOf("manifests");
  if (manifestsIndex < 2 || manifestsIndex !== segments.length - 2) {
    return null;
  }

  const repositoryName = segments[1]!;
  const imageName = segments.slice(2, manifestsIndex).join("/");
  const reference = segments[manifestsIndex + 1]!;

  if (!repositoryName || !imageName || !reference) {
    return null;
  }

  return {
    repositoryName,
    imageName,
    reference,
    isDigestReference: isDigestManifestReference(reference),
  };
}
