// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";

import { useTheme } from "@/components/providers/theme-provider";
import { Button } from "@/components/ui/button";
import {
  Menu,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from "@/components/ui/menu";
import type { ThemeMode } from "@/lib/theme/config";

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: React.ReactNode }[] = [
  { value: "light", label: "Light", icon: <SunIcon className="size-4" /> },
  { value: "dark", label: "Dark", icon: <MoonIcon className="size-4" /> },
  { value: "system", label: "System", icon: <MonitorIcon className="size-4" /> },
];

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const active =
    THEME_OPTIONS.find((option) => option.value === theme) ?? THEME_OPTIONS[2];

  return (
    <Menu>
      <MenuTrigger
        render={
          <Button variant="ghost" size="icon-sm" aria-label="Toggle theme" />
        }
      >
        {active.icon}
      </MenuTrigger>
      <MenuPopup align="end">
        <MenuRadioGroup value={theme} onValueChange={(value) => setTheme(value as ThemeMode)}>
          {THEME_OPTIONS.map((option) => (
            <MenuRadioItem key={option.value} value={option.value}>
              <span className="flex items-center gap-2">
                {option.icon}
                {option.label}
              </span>
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuPopup>
    </Menu>
  );
}
