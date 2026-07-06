// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import { AnchoredToastProvider, ToastProvider } from "@/components/ui/toast";
import { getDefaultTheme } from "@/lib/theme/config";

import { QueryProvider } from "./query-provider";
import { ThemeProvider } from "./theme-provider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider defaultTheme={getDefaultTheme()}>
      <QueryProvider>
        <ToastProvider>
          <AnchoredToastProvider>{children}</AnchoredToastProvider>
        </ToastProvider>
      </QueryProvider>
    </ThemeProvider>
  );
}
