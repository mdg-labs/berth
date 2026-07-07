// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { createTranslator } from "next-intl";

import type { Locale } from "./config";

type Namespace =
  | "common"
  | "metadata"
  | "navigation"
  | "auth"
  | "account"
  | "admin"
  | "repositories"
  | "catalog"
  | "tags"
  | "settings"
  | "delete"
  | "public"
  | "roles"
  | "errorsApi"
  | "emails";

async function loadNamespaceMessages(locale: Locale, namespace: Namespace) {
  const namespaceMessages = (
    await import(`../../messages/${locale}/${namespace}.json`)
  ).default;
  return namespaceMessages;
}

export async function getServerTranslator(
  locale: Locale,
  namespace: Namespace,
) {
  const messages = await loadNamespaceMessages(locale, namespace);

  return createTranslator({
    locale,
    namespace,
    messages: { [namespace]: messages },
  });
}
