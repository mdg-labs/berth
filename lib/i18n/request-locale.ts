// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { hasLocale } from "next-intl";
import type { NextRequest } from "next/server";

import { defaultLocale, locales, type Locale } from "./config";

export function getLocaleFromRequest(request: NextRequest): Locale {
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      const pathname = new URL(referer).pathname;
      for (const locale of locales) {
        if (pathname === `/${locale}` || pathname.startsWith(`/${locale}/`)) {
          return locale;
        }
      }
    } catch {
      // Invalid referer URL — fall through to other signals.
    }
  }

  const acceptLanguage = request.headers.get("accept-language");
  if (acceptLanguage) {
    const preferred = acceptLanguage.split(",")[0]?.trim().split("-")[0];
    if (preferred && hasLocale(locales, preferred)) {
      return preferred;
    }
  }

  return defaultLocale;
}
