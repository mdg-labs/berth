// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { mkdir, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const DIGEST_TAGGED = "sha256:aaaabbbbccccddddeeeeffff00001111222233334444555566667777";
const DIGEST_UNTAGGED = "sha256:1111222233334444555566667777888899990000aaaabbbbccccddddeeee";

async function writeManifestLink(
  root: string,
  fullImageName: string,
  digest: string,
): Promise<void> {
  const hex = digest.replace("sha256:", "");
  const linkPath = path.join(
    root,
    "docker",
    "registry",
    "v2",
    "repositories",
    ...fullImageName.split("/"),
    "_manifests",
    "revisions",
    "sha256",
    hex.slice(0, 2),
    hex.slice(2),
    "link",
  );
  await mkdir(path.dirname(linkPath), { recursive: true });
  await writeFile(linkPath, digest);
}

async function writeTagLink(
  root: string,
  fullImageName: string,
  tag: string,
  digest: string,
): Promise<void> {
  const linkPath = path.join(
    root,
    "docker",
    "registry",
    "v2",
    "repositories",
    ...fullImageName.split("/"),
    "_manifests",
    "tags",
    tag,
    "current",
    "link",
  );
  await mkdir(path.dirname(linkPath), { recursive: true });
  await writeFile(linkPath, digest);
}

describe("untagged digest storage inventory", () => {
  let tempRoot = "";
  const previousPath = process.env.REGISTRY_DATA_PATH;

  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "berth-untagged-"));
    process.env.REGISTRY_DATA_PATH = tempRoot;
  });

  afterEach(() => {
    if (previousPath === undefined) {
      delete process.env.REGISTRY_DATA_PATH;
    } else {
      process.env.REGISTRY_DATA_PATH = previousPath;
    }
    vi.resetModules();
  });

  it("returns digests with no current tag reference", async () => {
    const fullImageName = "demo-app/hello";
    await writeManifestLink(tempRoot, fullImageName, DIGEST_TAGGED);
    await writeManifestLink(tempRoot, fullImageName, DIGEST_UNTAGGED);
    await writeTagLink(tempRoot, fullImageName, "dev", DIGEST_TAGGED);

    const { listUntaggedDigests } = await import(
      "@/lib/registry/storage/untagged-digests"
    );

    expect(await listUntaggedDigests(fullImageName)).toEqual([DIGEST_UNTAGGED]);
  });

  it("returns empty list when all revisions are tagged", async () => {
    const fullImageName = "demo-app/hello";
    await writeManifestLink(tempRoot, fullImageName, DIGEST_TAGGED);
    await writeTagLink(tempRoot, fullImageName, "dev", DIGEST_TAGGED);

    const { listUntaggedDigests } = await import(
      "@/lib/registry/storage/untagged-digests"
    );

    expect(await listUntaggedDigests(fullImageName)).toEqual([]);
  });

  it("reports storage readability", async () => {
    const { isRegistryStorageReadable } = await import(
      "@/lib/registry/storage/untagged-digests"
    );

    expect(await isRegistryStorageReadable()).toBe(true);
  });
});
