// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import { NextIntlClientProvider } from "next-intl";
import type { AbstractIntlMessages } from "next-intl";

import { AnchoredToastProvider, ToastProvider } from "@/components/ui/toast";
import { getDefaultTheme } from "@/lib/theme/config";

import { NuqsProvider } from "./nuqs-provider";
import { QueryProvider } from "./query-provider";
import { ThemeProvider } from "./theme-provider";

type AppProvidersProps = {
  children: React.ReactNode;
  locale: string;
  messages: AbstractIntlMessages;
};

export function AppProviders({
  children,
  locale,
  messages,
}: AppProvidersProps) {
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <ThemeProvider defaultTheme={getDefaultTheme()}>
        <QueryProvider>
          <NuqsProvider>
            <ToastProvider>
              <AnchoredToastProvider>{children}</AnchoredToastProvider>
            </ToastProvider>
          </NuqsProvider>
        </QueryProvider>
      </ThemeProvider>
    </NextIntlClientProvider>
  );
}
