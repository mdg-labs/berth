// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

import { getRegistryDataPath } from "@/lib/gc/volume-size";

const MANIFESTS_DIR = "_manifests";
const REVISIONS_DIR = "revisions";
const TAGS_DIR = "tags";
const SHA256_DIR = "sha256";
const LINK_FILE = "link";
const CURRENT_LINK = path.join("current", LINK_FILE);

function repositoryManifestsPath(fullImageName: string): string {
  const root = getRegistryDataPath();
  const segments = fullImageName.split("/").filter(Boolean);
  return path.join(
    root,
    "docker",
    "registry",
    "v2",
    "repositories",
    ...segments,
    MANIFESTS_DIR,
  );
}

async function readDigestFromLink(linkPath: string): Promise<string | null> {
  try {
    const content = (await readFile(linkPath, "utf8")).trim();
    if (content.startsWith("sha256:")) {
      return content;
    }
    return null;
  } catch {
    return null;
  }
}

async function collectRevisionDigests(manifestsPath: string): Promise<Set<string>> {
  const digests = new Set<string>();
  const revisionsPath = path.join(manifestsPath, REVISIONS_DIR, SHA256_DIR);

  let digestEntries;
  try {
    digestEntries = await readdir(revisionsPath, { withFileTypes: true });
  } catch {
    return digests;
  }

  for (const digestEntry of digestEntries) {
    if (!digestEntry.isDirectory()) {
      continue;
    }

    // Distribution stores manifest revisions as revisions/sha256/<full-hex>/link
    // (multilevel=false), not the two-level blob store layout.
    const linkPath = path.join(revisionsPath, digestEntry.name, LINK_FILE);
    const digest = await readDigestFromLink(linkPath);
    if (digest) {
      digests.add(digest);
    }
  }

  return digests;
}

async function collectTaggedDigests(manifestsPath: string): Promise<Set<string>> {
  const digests = new Set<string>();
  const tagsPath = path.join(manifestsPath, TAGS_DIR);

  let tagEntries;
  try {
    tagEntries = await readdir(tagsPath, { withFileTypes: true });
  } catch {
    return digests;
  }

  for (const tagEntry of tagEntries) {
    if (!tagEntry.isDirectory()) {
      continue;
    }

    const linkPath = path.join(tagsPath, tagEntry.name, CURRENT_LINK);
    const digest = await readDigestFromLink(linkPath);
    if (digest) {
      digests.add(digest);
    }
  }

  return digests;
}

export async function isRegistryStorageReadable(): Promise<boolean> {
  const root = getRegistryDataPath();

  try {
    const rootStat = await stat(root);
    return rootStat.isDirectory();
  } catch {
    return false;
  }
}

export async function listUntaggedDigests(fullImageName: string): Promise<string[]> {
  const manifestsPath = repositoryManifestsPath(fullImageName);

  try {
    const manifestsStat = await stat(manifestsPath);
    if (!manifestsStat.isDirectory()) {
      return [];
    }
  } catch {
    return [];
  }

  const [allDigests, taggedDigests] = await Promise.all([
    collectRevisionDigests(manifestsPath),
    collectTaggedDigests(manifestsPath),
  ]);

  const untagged: string[] = [];
  for (const digest of allDigests) {
    if (!taggedDigests.has(digest)) {
      untagged.push(digest);
    }
  }

  untagged.sort((a, b) => b.localeCompare(a));
  return untagged;
}
