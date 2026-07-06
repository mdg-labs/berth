// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { readFileSync } from "node:fs";

import { importPKCS8 } from "jose";

let cachedPrivateKey: CryptoKey | null = null;
let cachedCertDer: string | null = null;

function readPemFromEnvOrPath(
  envValue: string | undefined,
  pathValue: string | undefined,
): string {
  const inline = envValue?.trim();
  if (inline) {
    return inline.replace(/\\n/g, "\n");
  }

  const filePath = pathValue?.trim();
  if (filePath) {
    return readFileSync(filePath, "utf8");
  }

  throw new Error("Token signing key or certificate is not configured");
}

function pemToDerBase64(pem: string): string {
  return pem
    .replace(/-----BEGIN CERTIFICATE-----/g, "")
    .replace(/-----END CERTIFICATE-----/g, "")
    .replace(/\s+/g, "");
}

export async function getSigningPrivateKey(): Promise<CryptoKey> {
  if (cachedPrivateKey) {
    return cachedPrivateKey;
  }

  const pem = readPemFromEnvOrPath(
    process.env.TOKEN_SIGNING_KEY,
    process.env.TOKEN_SIGNING_KEY_PATH,
  );

  cachedPrivateKey = await importPKCS8(pem, "RS256");
  return cachedPrivateKey;
}

export function getSigningCertDer(): string {
  if (cachedCertDer) {
    return cachedCertDer;
  }

  const pem = readPemFromEnvOrPath(
    process.env.TOKEN_CERT,
    process.env.TOKEN_CERT_PATH,
  );

  cachedCertDer = pemToDerBase64(pem);
  return cachedCertDer;
}

export function resetSigningKeyCache(): void {
  cachedPrivateKey = null;
  cachedCertDer = null;
}
