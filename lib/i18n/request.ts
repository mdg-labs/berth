// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";

import { routing } from "./config";

const namespaces = [
  "common",
  "metadata",
  "navigation",
  "auth",
  "account",
  "admin",
  "repositories",
  "catalog",
  "tags",
  "settings",
  "delete",
  "public",
  "roles",
  "errors.api",
  "emails",
] as const;

async function loadMessages(locale: string) {
  const entries = await Promise.all(
    namespaces.map(async (namespace) => {
      const namespaceMessages = (
        await import(`../../messages/${locale}/${namespace}.json`)
      ).default;
      return [namespace, namespaceMessages] as const;
    }),
  );

  return Object.fromEntries(entries);
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  return {
    locale,
    messages: await loadMessages(locale),
  };
});
