// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { createHash } from "node:crypto";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:8080";

function sha256Digest(data: Buffer): string {
  return `sha256:${createHash("sha256").update(data).digest("hex")}`;
}

async function fetchRegistryToken(
  scope: string,
  basicAuth: string,
): Promise<string> {
  const response = await fetch(
    `${BASE_URL}/api/auth/token?service=registry&scope=${encodeURIComponent(scope)}`,
    { headers: { Authorization: basicAuth } },
  );

  if (!response.ok) {
    throw new Error(`Token request failed (${response.status})`);
  }

  const body = (await response.json()) as { token: string };
  return body.token;
}

async function uploadBlob(
  repository: string,
  token: string,
  data: Buffer,
): Promise<string> {
  const digest = sha256Digest(data);

  const exists = await fetch(`${BASE_URL}/v2/${repository}/blobs/${digest}`, {
    method: "HEAD",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (exists.ok) {
    return digest;
  }

  const start = await fetch(`${BASE_URL}/v2/${repository}/blobs/uploads/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    redirect: "manual",
  });

  if (![200, 201, 202].includes(start.status)) {
    throw new Error(`Blob upload start failed (${start.status})`);
  }

  let uploadUrl = start.headers.get("location");
  if (!uploadUrl) {
    throw new Error("Missing upload Location header");
  }
  if (!uploadUrl.startsWith("http")) {
    uploadUrl = new URL(uploadUrl, BASE_URL).toString();
  }

  const separator = uploadUrl.includes("?") ? "&" : "?";
  const putUrl = `${uploadUrl}${separator}digest=${encodeURIComponent(digest)}`;

  const put = await fetch(putUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/octet-stream",
      "Content-Length": String(data.length),
    },
    body: new Uint8Array(data),
  });

  if (![201, 202].includes(put.status)) {
    throw new Error(`Blob upload failed (${put.status})`);
  }

  return digest;
}

/** Push a minimal OCI manifest via the registry API (no Docker CLI required). */
export async function pushHelloTag(
  projectName: string,
  repoName: string,
  tag: string,
  credentials: { email: string; password: string },
): Promise<void> {
  const basicAuth = `Basic ${Buffer.from(`${credentials.email}:${credentials.password}`).toString("base64")}`;
  const repository = `${projectName}/${repoName}`;
  const scope = `repository:${repository}:push,pull`;
  const token = await fetchRegistryToken(scope, basicAuth);

  const layerData = Buffer.from("berth e2e fixture\n");
  const layerDigest = await uploadBlob(repository, token, layerData);

  const configJson = Buffer.from(
    JSON.stringify({
      created: new Date().toISOString(),
      architecture: "amd64",
      os: "linux",
      config: {},
      rootfs: {
        type: "layers",
        diff_ids: [layerDigest],
      },
    }),
  );
  const configDigest = await uploadBlob(repository, token, configJson);

  const manifest = {
    schemaVersion: 2,
    mediaType: "application/vnd.docker.distribution.manifest.v2+json",
    config: {
      mediaType: "application/vnd.oci.image.config.v1+json",
      size: configJson.length,
      digest: configDigest,
    },
    layers: [
      {
        mediaType: "application/vnd.oci.image.layer.v1.tar",
        size: layerData.length,
        digest: layerDigest,
      },
    ],
  };

  const manifestBody = Buffer.from(JSON.stringify(manifest));
  const manifestResponse = await fetch(
    `${BASE_URL}/v2/${repository}/manifests/${encodeURIComponent(tag)}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/vnd.docker.distribution.manifest.v2+json",
        "Content-Length": String(manifestBody.length),
      },
      body: new Uint8Array(manifestBody),
    },
  );

  if (manifestResponse.status !== 201) {
    const text = await manifestResponse.text();
    throw new Error(
      `Manifest push failed (${manifestResponse.status}): ${text}`,
    );
  }
}
