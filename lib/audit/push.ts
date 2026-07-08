// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import type { NextRequest } from "next/server";

import { writeAuditLog } from "@/lib/audit/log";
import { findUserByEmail, getClientIp } from "@/lib/auth/credentials";
import { parseManifestPath } from "@/lib/registry/proxy/parse-manifest-path";
import { getRepositoryByName } from "@/lib/rbac/roles";

export type RecordManifestPushInput = {
  request: NextRequest;
  upstreamStatus: number;
  tokenSubject: string | null;
  digest: string | null;
};

function buildPushResource(parsed: {
  repositoryName: string;
  imageName: string;
  reference: string;
  isDigestReference: boolean;
}): string {
  const refKey = parsed.isDigestReference ? "digest" : "tag";
  return `repository:${parsed.repositoryName}/image:${parsed.imageName}:${refKey}:${parsed.reference}`;
}

export async function recordManifestPush(
  input: RecordManifestPushInput,
): Promise<void> {
  const { request, upstreamStatus, tokenSubject, digest } = input;

  if (
    (request.method !== "PUT" && request.method !== "POST") ||
    upstreamStatus < 200 ||
    upstreamStatus >= 300
  ) {
    return;
  }

  const parsed = parseManifestPath(request.nextUrl.pathname);
  if (!parsed) {
    return;
  }

  const repository = await getRepositoryByName(parsed.repositoryName);
  if (!repository) {
    return;
  }

  let userId: string | null = null;
  if (tokenSubject && tokenSubject !== "anonymous") {
    const user = await findUserByEmail(tokenSubject);
    userId = user?.id ?? null;
  }

  await writeAuditLog({
    userId,
    action: "registry.manifest.push",
    resource: buildPushResource(parsed),
    repositoryId: repository.id,
    metadata: {
      method: request.method,
      reference: parsed.reference,
      digest,
    },
    clientIp: getClientIp(request),
  });
}

export function scheduleManifestPushRecording(
  input: RecordManifestPushInput,
): void {
  void recordManifestPush(input).catch((error) => {
    console.error("Failed to record manifest push audit", error);
  });
}
