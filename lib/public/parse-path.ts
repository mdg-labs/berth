// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

export function parsePublicImageTagsPath(
  segments: string[] | undefined,
): { imageName: string } | null {
  if (!segments || segments.length < 2) {
    return null;
  }

  const decoded = segments.map(decodeURIComponent);
  if (decoded.at(-1) !== "tags") {
    return null;
  }

  const imageName = decoded.slice(0, -1).join("/");
  if (!imageName) {
    return null;
  }

  return { imageName };
}
