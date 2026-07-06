// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import * as client from "openid-client";

import {
  getOidcClientId,
  getOidcClientSecret,
  getOidcIssuer,
} from "./config";

let cachedConfig: client.Configuration | undefined;

export async function getOidcConfiguration(): Promise<client.Configuration> {
  if (cachedConfig) {
    return cachedConfig;
  }

  cachedConfig = await client.discovery(
    new URL(getOidcIssuer()),
    getOidcClientId(),
    getOidcClientSecret(),
  );

  return cachedConfig;
}

export function resetOidcConfigurationCache(): void {
  cachedConfig = undefined;
}

export { client as oidcClient };
