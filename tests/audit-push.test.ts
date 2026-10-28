// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  writeAuditLogMock,
  findUserByEmailMock,
  getRepositoryByNameMock,
  getMachineAccountSnapshotMock,
} = vi.hoisted(() => ({
  writeAuditLogMock: vi.fn(),
  findUserByEmailMock: vi.fn(),
  getRepositoryByNameMock: vi.fn(),
  getMachineAccountSnapshotMock: vi.fn(),
}));

vi.mock("@/lib/machine-accounts/store", () => ({
  getMachineAccountSnapshot: getMachineAccountSnapshotMock,
}));

vi.mock("@/lib/audit/log", () => ({
  writeAuditLog: writeAuditLogMock,
}));

vi.mock("@/lib/auth/credentials", () => ({
  findUserByEmail: findUserByEmailMock,
  getClientIp: () => "203.0.113.10",
}));

vi.mock("@/lib/rbac/roles", () => ({
  getRepositoryByName: getRepositoryByNameMock,
}));

import { recordManifestPush } from "@/lib/audit/push";

function manifestRequest(method: string, status = 201): {
  request: NextRequest;
  upstreamStatus: number;
} {
  const request = new NextRequest(
    "http://localhost:8080/v2/demo-app/my-image/manifests/latest",
    { method },
  );

  return { request, upstreamStatus: status };
}

describe("recordManifestPush", () => {
  beforeEach(() => {
    writeAuditLogMock.mockReset();
    findUserByEmailMock.mockReset();
    getRepositoryByNameMock.mockReset();
    getMachineAccountSnapshotMock.mockReset();
    getRepositoryByNameMock.mockResolvedValue({ id: "repo-1", name: "demo-app" });
    findUserByEmailMock.mockResolvedValue({ id: "user-1", email: "dev@example.com" });
  });

  it("writes audit log for successful manifest PUT", async () => {
    const { request, upstreamStatus } = manifestRequest("PUT");

    await recordManifestPush({
      request,
      upstreamStatus,
      tokenSubject: "dev@example.com",
      digest: "sha256:abc",
    });

    expect(writeAuditLogMock).toHaveBeenCalledWith({
      userId: "user-1",
      action: "registry.manifest.push",
      resource: "repository:demo-app/image:my-image:tag:latest",
      repositoryId: "repo-1",
      metadata: {
        method: "PUT",
        reference: "latest",
        digest: "sha256:abc",
      },
      clientIp: "203.0.113.10",
    });
  });

  it("skips non-manifest methods", async () => {
    const request = new NextRequest(
      "http://localhost:8080/v2/demo-app/my-image/blobs/uploads/uuid",
      { method: "POST" },
    );

    await recordManifestPush({
      request,
      upstreamStatus: 202,
      tokenSubject: "dev@example.com",
      digest: null,
    });

    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });

  it("skips failed upstream responses", async () => {
    const { request } = manifestRequest("PUT", 401);

    await recordManifestPush({
      request,
      upstreamStatus: 401,
      tokenSubject: "dev@example.com",
      digest: null,
    });

    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });

  it("attributes a machine token push to the account and never looks up a user", async () => {
    const snapshot = { id: "acct-1", name: "ci", kind: "repository" };
    getMachineAccountSnapshotMock.mockResolvedValue(snapshot);
    const { request, upstreamStatus } = manifestRequest("PUT");

    await recordManifestPush({
      request,
      upstreamStatus,
      tokenSubject: "machine:acct-1",
      machineAccountId: "acct-1",
      digest: "sha256:abc",
    });

    expect(findUserByEmailMock).not.toHaveBeenCalled();
    expect(writeAuditLogMock).toHaveBeenCalledWith({
      userId: null,
      machineAccountId: "acct-1",
      action: "registry.manifest.push",
      resource: "repository:demo-app/image:my-image:tag:latest",
      repositoryId: "repo-1",
      metadata: {
        method: "PUT",
        reference: "latest",
        digest: "sha256:abc",
        machineAccount: snapshot,
      },
      clientIp: "203.0.113.10",
    });
  });

  it("does not fall back to the subject when the machine account is already gone", async () => {
    getMachineAccountSnapshotMock.mockResolvedValue(null);
    findUserByEmailMock.mockResolvedValue({ id: "user-1", email: "machine:acct-1" });
    const { request, upstreamStatus } = manifestRequest("PUT");

    await recordManifestPush({
      request,
      upstreamStatus,
      tokenSubject: "machine:acct-1",
      machineAccountId: "acct-1",
      digest: "sha256:abc",
    });

    expect(findUserByEmailMock).not.toHaveBeenCalled();
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: null,
        machineAccountId: null,
        metadata: expect.objectContaining({ machineAccount: { id: "acct-1" } }),
      }),
    );
  });
});
