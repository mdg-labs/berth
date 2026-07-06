// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

export type ThemeMode = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "berth-theme";

export function getDefaultTheme(): ThemeMode {
  const configured = process.env.THEME_DEFAULT?.trim().toLowerCase();
  if (configured === "light" || configured === "dark" || configured === "system") {
    return configured;
  }
  return "system";
}
