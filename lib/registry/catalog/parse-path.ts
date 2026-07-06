// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

export type ParsedImageApiPath =
  | { kind: "tags-list"; imageName: string }
  | { kind: "tag-detail"; imageName: string; tag: string }
  | { kind: "tag-siblings"; imageName: string; tag: string }
  | { kind: "bulk-delete"; imageName: string };

export function parseImageDeletePath(
  segments: string[] | undefined,
): { imageName: string } | null {
  if (!segments || segments.length === 0) {
    return null;
  }

  const decoded = segments.map(decodeURIComponent);
  if (decoded.includes("tags")) {
    return null;
  }

  return { imageName: decoded.join("/") };
}

export function parseImageApiPath(
  segments: string[] | undefined,
): ParsedImageApiPath | null {
  if (!segments || segments.length < 2) {
    return null;
  }

  const decoded = segments.map(decodeURIComponent);
  const tagsIndex = decoded.lastIndexOf("tags");
  if (tagsIndex < 1) {
    return null;
  }

  const imageName = decoded.slice(0, tagsIndex).join("/");
  const afterTags = decoded.slice(tagsIndex + 1);

  if (afterTags.length === 0) {
    return { kind: "tags-list", imageName };
  }

  if (afterTags.length === 1) {
    if (afterTags[0] === "bulk-delete") {
      return { kind: "bulk-delete", imageName };
    }
    return { kind: "tag-detail", imageName, tag: afterTags[0]! };
  }

  if (afterTags.length === 2 && afterTags[1] === "siblings") {
    return { kind: "tag-siblings", imageName, tag: afterTags[0]! };
  }

  return null;
}
