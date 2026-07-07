// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE
//
// i18n architecture (next-intl):
// - Locales and routing live here; add new locales to `locales` and `messages/<locale>/`.
// - UI copy: `messages/en/<namespace>.json` loaded in `lib/i18n/request.ts`.
// - Client components: `useTranslations("<namespace>")`; server: `getTranslations` or
//   `getServerTranslator` for emails/API-adjacent copy.
// - API errors: never surface `ApiError.message`; map codes via `formatApiError` +
//   `messages/en/errorsApi.json`.
// - Links: `@/lib/i18n/navigation` (`Link`, `useRouter`, `usePathname`) for locale-aware routes.
// - CI guard: `pnpm check:i18n` scans migrated dirs for hardcoded English stragglers.

import { defineRouting } from "next-intl/routing";

export const locales = ["en"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

export const routing = defineRouting({
  locales: [...locales],
  defaultLocale,
  localePrefix: "as-needed",
});
