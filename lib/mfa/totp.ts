// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import QRCode from "qrcode";
import { randomBytes } from "node:crypto";
import { generateSecret, generateURI, verify } from "otplib";

import { getMfaIssuer, MFA_TOTP_EPOCH_TOLERANCE } from "./config";

export function createTotpSecret(): string {
  return generateSecret();
}

export function buildOtpAuthUri(input: {
  secret: string;
  accountName: string;
}): string {
  return generateURI({
    issuer: getMfaIssuer(),
    label: input.accountName,
    secret: input.secret,
  });
}

export async function buildQrDataUrl(otpauthUri: string): Promise<string> {
  return QRCode.toDataURL(otpauthUri, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 220,
  });
}

export async function verifyTotpCode(
  secret: string,
  token: string,
): Promise<boolean> {
  const normalized = token.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(normalized)) {
    return false;
  }

  const result = await verify({
    secret,
    token: normalized,
    epochTolerance: MFA_TOTP_EPOCH_TOLERANCE,
  });

  return result.valid;
}

export function generateBackupCodes(count: number): string[] {
  const codes: string[] = [];

  for (let index = 0; index < count; index += 1) {
    const partA = randomSegment();
    const partB = randomSegment();
    codes.push(`${partA}-${partB}`);
  }

  return codes;
}

function randomSegment(): string {
  return randomBytes(4).toString("hex").slice(0, 4).toUpperCase();
}
