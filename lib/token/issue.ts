// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { SignJWT } from "jose";

import { getTokenIssuer, getTokenTtlSeconds } from "./config";
import { getSigningCertDer, getSigningPrivateKey } from "./keys";
import type { RegistryAccess } from "./scope";

export type IssuedRegistryToken = {
  token: string;
  expiresIn: number;
  issuedAt: string;
};

export async function issueRegistryToken(
  subject: string,
  service: string,
  access: RegistryAccess[],
): Promise<IssuedRegistryToken> {
  const ttlSeconds = getTokenTtlSeconds();
  const now = Math.floor(Date.now() / 1000);
  const privateKey = await getSigningPrivateKey();
  const x5c = getSigningCertDer();

  const token = await new SignJWT({ access })
    .setProtectedHeader({ alg: "RS256", typ: "JWT", x5c: [x5c] })
    .setIssuer(getTokenIssuer())
    .setSubject(subject)
    .setAudience(service)
    .setIssuedAt(now)
    .setNotBefore(now)
    .setExpirationTime(now + ttlSeconds)
    .sign(privateKey);

  return {
    token,
    expiresIn: ttlSeconds,
    issuedAt: new Date(now * 1000).toISOString(),
  };
}
