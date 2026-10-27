// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { mkdir, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const DIGEST_TAGGED =
  "sha256:d32663906812f27568205677a5b60295dccd8ec785300eba185c39ba1713513c";
const DIGEST_UNTAGGED_A =
  "sha256:7db3c472dd47661798ddd1259dcfba5c7ddd8d69556e637443963f5c8acf491b";
const DIGEST_UNTAGGED_B =
  "sha256:bcd36deddafdbb5d026fb398fde373204ac85ef15a3da1c21e67c0e67a02677b";

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
    hex,
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

const DIGEST_CHILD_A =
  "sha256:1111111111111111111111111111111111111111111111111111111111111111";
const DIGEST_CHILD_B =
  "sha256:2222222222222222222222222222222222222222222222222222222222222222";
const DIGEST_NESTED_INDEX =
  "sha256:3333333333333333333333333333333333333333333333333333333333333333";
const DIGEST_NESTED_CHILD =
  "sha256:4444444444444444444444444444444444444444444444444444444444444444";

async function writeBlob(
  root: string,
  digest: string,
  body: unknown,
): Promise<void> {
  const hex = digest.replace("sha256:", "");
  const dataPath = path.join(
    root,
    "docker",
    "registry",
    "v2",
    "blobs",
    "sha256",
    hex.slice(0, 2),
    hex,
    "data",
  );
  await mkdir(path.dirname(dataPath), { recursive: true });
  await writeFile(
    dataPath,
    typeof body === "string" ? body : JSON.stringify(body),
  );
}

const IMAGE_MANIFEST = {
  schemaVersion: 2,
  mediaType: "application/vnd.oci.image.manifest.v1+json",
  layers: [],
};

function indexOf(...digests: string[]) {
  return {
    schemaVersion: 2,
    mediaType: "application/vnd.oci.image.index.v1+json",
    manifests: digests.map((digest) => ({ digest })),
  };
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
    await writeManifestLink(tempRoot, fullImageName, DIGEST_UNTAGGED_A);
    await writeManifestLink(tempRoot, fullImageName, DIGEST_UNTAGGED_B);
    await writeTagLink(tempRoot, fullImageName, "dev", DIGEST_TAGGED);
    await writeBlob(tempRoot, DIGEST_TAGGED, IMAGE_MANIFEST);

    const { listUntaggedDigests } = await import(
      "@/lib/registry/storage/untagged-digests"
    );

    expect(await listUntaggedDigests(fullImageName)).toEqual([
      DIGEST_UNTAGGED_B,
      DIGEST_UNTAGGED_A,
    ]);
  });

  it("returns empty list when all revisions are tagged", async () => {
    const fullImageName = "demo-app/hello";
    await writeManifestLink(tempRoot, fullImageName, DIGEST_TAGGED);
    await writeTagLink(tempRoot, fullImageName, "dev", DIGEST_TAGGED);
    await writeBlob(tempRoot, DIGEST_TAGGED, IMAGE_MANIFEST);

    const { listUntaggedDigests } = await import(
      "@/lib/registry/storage/untagged-digests"
    );

    expect(await listUntaggedDigests(fullImageName)).toEqual([]);
  });

  it("does not list children of a tagged index, including nested indexes", async () => {
    const fullImageName = "demo-app/multi";
    for (const digest of [
      DIGEST_TAGGED,
      DIGEST_CHILD_A,
      DIGEST_CHILD_B,
      DIGEST_NESTED_INDEX,
      DIGEST_NESTED_CHILD,
      DIGEST_UNTAGGED_A,
    ]) {
      await writeManifestLink(tempRoot, fullImageName, digest);
    }
    await writeTagLink(tempRoot, fullImageName, "latest", DIGEST_TAGGED);
    await writeBlob(
      tempRoot,
      DIGEST_TAGGED,
      indexOf(DIGEST_CHILD_A, DIGEST_CHILD_B, DIGEST_NESTED_INDEX),
    );
    await writeBlob(tempRoot, DIGEST_CHILD_A, IMAGE_MANIFEST);
    await writeBlob(tempRoot, DIGEST_CHILD_B, IMAGE_MANIFEST);
    await writeBlob(tempRoot, DIGEST_NESTED_INDEX, indexOf(DIGEST_NESTED_CHILD));
    await writeBlob(tempRoot, DIGEST_NESTED_CHILD, IMAGE_MANIFEST);
    await writeBlob(tempRoot, DIGEST_UNTAGGED_A, IMAGE_MANIFEST);

    const { listUntaggedDigests } = await import(
      "@/lib/registry/storage/untagged-digests"
    );

    expect(await listUntaggedDigests(fullImageName)).toEqual([DIGEST_UNTAGGED_A]);
  });

  it("terminates on an index that references itself", async () => {
    const fullImageName = "demo-app/cycle";
    await writeManifestLink(tempRoot, fullImageName, DIGEST_TAGGED);
    await writeManifestLink(tempRoot, fullImageName, DIGEST_UNTAGGED_A);
    await writeTagLink(tempRoot, fullImageName, "latest", DIGEST_TAGGED);
    await writeBlob(tempRoot, DIGEST_TAGGED, indexOf(DIGEST_TAGGED));
    await writeBlob(tempRoot, DIGEST_UNTAGGED_A, IMAGE_MANIFEST);

    const { listUntaggedDigests } = await import(
      "@/lib/registry/storage/untagged-digests"
    );

    expect(await listUntaggedDigests(fullImageName)).toEqual([DIGEST_UNTAGGED_A]);
  });

  it("lists nothing when a tagged manifest body cannot be read", async () => {
    const fullImageName = "demo-app/multi";
    await writeManifestLink(tempRoot, fullImageName, DIGEST_TAGGED);
    await writeManifestLink(tempRoot, fullImageName, DIGEST_CHILD_A);
    await writeManifestLink(tempRoot, fullImageName, DIGEST_UNTAGGED_A);
    await writeTagLink(tempRoot, fullImageName, "latest", DIGEST_TAGGED);

    const { listUntaggedDigests } = await import(
      "@/lib/registry/storage/untagged-digests"
    );

    expect(await listUntaggedDigests(fullImageName)).toEqual([]);
  });

  it("lists nothing when a referenced index body is not valid JSON", async () => {
    const fullImageName = "demo-app/multi";
    await writeManifestLink(tempRoot, fullImageName, DIGEST_TAGGED);
    await writeManifestLink(tempRoot, fullImageName, DIGEST_UNTAGGED_A);
    await writeTagLink(tempRoot, fullImageName, "latest", DIGEST_TAGGED);
    await writeBlob(tempRoot, DIGEST_TAGGED, "{not json");

    const { listUntaggedDigests } = await import(
      "@/lib/registry/storage/untagged-digests"
    );

    expect(await listUntaggedDigests(fullImageName)).toEqual([]);
  });

  it("lists nothing when a tag's current link is malformed", async () => {
    const fullImageName = "demo-app/hello";
    await writeManifestLink(tempRoot, fullImageName, DIGEST_TAGGED);
    await writeManifestLink(tempRoot, fullImageName, DIGEST_UNTAGGED_A);
    await writeTagLink(tempRoot, fullImageName, "dev", DIGEST_UNTAGGED_A);
    await writeTagLink(tempRoot, fullImageName, "latest", "not-a-digest");
    await writeBlob(tempRoot, DIGEST_UNTAGGED_A, IMAGE_MANIFEST);

    const { listUntaggedDigests } = await import(
      "@/lib/registry/storage/untagged-digests"
    );

    expect(await listUntaggedDigests(fullImageName)).toEqual([]);
  });

  it("lists nothing when a tag's current link cannot be read", async () => {
    const fullImageName = "demo-app/hello";
    await writeManifestLink(tempRoot, fullImageName, DIGEST_TAGGED);
    await writeManifestLink(tempRoot, fullImageName, DIGEST_UNTAGGED_A);
    await writeTagLink(tempRoot, fullImageName, "dev", DIGEST_UNTAGGED_A);
    await writeBlob(tempRoot, DIGEST_UNTAGGED_A, IMAGE_MANIFEST);
    await mkdir(
      path.join(
        tempRoot,
        "docker",
        "registry",
        "v2",
        "repositories",
        ...fullImageName.split("/"),
        "_manifests",
        "tags",
        "latest",
        "current",
        "link",
      ),
      { recursive: true },
    );

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
