// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:8080";
const MAX_ATTEMPTS = 60;
const INTERVAL_MS = 2_000;

async function waitForEndpoint(path: string): Promise<void> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(`${BASE_URL}${path}`, {
        signal: AbortSignal.timeout(5_000),
      });
      if (response.ok) {
        return;
      }
    } catch {
      // stack not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS));
  }

  throw new Error(`Timed out waiting for ${BASE_URL}${path}`);
}

export default async function globalSetup(): Promise<void> {
  await waitForEndpoint("/api/health");
  await waitForEndpoint("/api/ready");
}
