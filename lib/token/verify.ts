// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { jwtVerify } from "jose";

import { MACHINE_ACCOUNT_CLAIM } from "./claims";
import { getTokenIssuer, getTokenService } from "./config";
import { getVerificationPublicKey } from "./keys";

export type RegistryTokenVerifyResult =
  | { ok: true; subject: string; machineAccountId?: string }
  | { ok: false; reason: "missing" | "invalid" };

export function extractBearerToken(
  authorizationHeader: string | null,
): string | null {
  if (!authorizationHeader) {
    return null;
  }

  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());
  return match?.[1]?.trim() || null;
}

export async function verifyRegistryBearerToken(
  token: string,
): Promise<RegistryTokenVerifyResult> {
  try {
    const publicKey = await getVerificationPublicKey();
    const { payload } = await jwtVerify(token, publicKey, {
      issuer: getTokenIssuer(),
      audience: getTokenService(),
    });

    const subject =
      typeof payload.sub === "string" && payload.sub.length > 0
        ? payload.sub
        : "unknown";

    const machineClaim = payload[MACHINE_ACCOUNT_CLAIM];
    if (typeof machineClaim === "string" && machineClaim.length > 0) {
      return { ok: true, subject, machineAccountId: machineClaim };
    }

    return { ok: true, subject };
  } catch {
    return { ok: false, reason: "invalid" };
  }
}
