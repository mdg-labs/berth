// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { readdir, stat } from "node:fs/promises";
import path from "node:path";

export function getRegistryDataPath(): string {
  return process.env.REGISTRY_DATA_PATH?.trim() || "/var/lib/registry";
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ["KiB", "MiB", "GiB", "TiB"] as const;
  let value = bytes;
  let unitIndex = -1;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

async function directorySizeBytes(dirPath: string): Promise<number> {
  let total = 0;
  const entries = await readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      total += await directorySizeBytes(entryPath);
      continue;
    }

    if (entry.isFile() || entry.isSymbolicLink()) {
      const fileStat = await stat(entryPath);
      total += fileStat.size;
    }
  }

  return total;
}

export async function calculateRegistryDataSize(): Promise<number | null> {
  const root = getRegistryDataPath();

  try {
    const rootStat = await stat(root);
    if (!rootStat.isDirectory()) {
      return null;
    }

    return await directorySizeBytes(root);
  } catch {
    return null;
  }
}
