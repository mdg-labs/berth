// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

export type ParsedRepoApiPath =
  | { kind: "tags-list"; repoName: string }
  | { kind: "tag-detail"; repoName: string; tag: string }
  | { kind: "tag-siblings"; repoName: string; tag: string }
  | { kind: "bulk-delete"; repoName: string };

export function parseRepoDeletePath(
  segments: string[] | undefined,
): { repoName: string } | null {
  if (!segments || segments.length === 0) {
    return null;
  }

  const decoded = segments.map(decodeURIComponent);
  if (decoded.includes("tags")) {
    return null;
  }

  return { repoName: decoded.join("/") };
}

export function parseRepoApiPath(
  segments: string[] | undefined,
): ParsedRepoApiPath | null {
  if (!segments || segments.length < 2) {
    return null;
  }

  const decoded = segments.map(decodeURIComponent);
  const tagsIndex = decoded.lastIndexOf("tags");
  if (tagsIndex < 1) {
    return null;
  }

  const repoName = decoded.slice(0, tagsIndex).join("/");
  const afterTags = decoded.slice(tagsIndex + 1);

  if (afterTags.length === 0) {
    return { kind: "tags-list", repoName };
  }

  if (afterTags.length === 1) {
    if (afterTags[0] === "bulk-delete") {
      return { kind: "bulk-delete", repoName };
    }
    return { kind: "tag-detail", repoName, tag: afterTags[0]! };
  }

  if (afterTags.length === 2 && afterTags[1] === "siblings") {
    return { kind: "tag-siblings", repoName, tag: afterTags[0]! };
  }

  return null;
}
