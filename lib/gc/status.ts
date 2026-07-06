// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import {
  calculateRegistryDataSize,
  formatBytes,
  getRegistryDataPath,
} from "./volume-size";

export type GcStatus = {
  registryDataPath: string;
  storageBytes: number | null;
  storageHuman: string;
  gcCommand: string;
  warnings: string[];
};

export function buildGcCommand(): string {
  return "docker compose -f docker/compose.yml run --rm --entrypoint registry registry garbage-collect --delete-untagged /etc/distribution/config.yml";
}

export async function getGcStatus(): Promise<GcStatus> {
  const storageBytes = await calculateRegistryDataSize();

  return {
    registryDataPath: getRegistryDataPath(),
    storageBytes,
    storageHuman:
      storageBytes === null ? "unavailable" : formatBytes(storageBytes),
    gcCommand: buildGcCommand(),
    warnings: [
      "Stop the registry service or set maintenance read-only mode before running garbage collection.",
      "Running GC while the registry accepts writes can corrupt newly pushed images.",
      "Storage usage is approximate — it reflects the registry-data volume size on disk.",
    ],
  };
}
