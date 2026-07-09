// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { BerthWordmark } from "@/components/brand/berth-wordmark";
import { GithubIcon } from "@/components/icons/github-icon";
import { Button } from "@/components/ui/button";

const GITHUB_REPO_URL = "https://github.com/mdg-labs/berth";

type PublicShellProps = {
  children: React.ReactNode;
};

export function PublicShell({ children }: PublicShellProps) {
  const t = useTranslations("public");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 md:px-6">
          <Link
            href="/"
            className="transition-opacity hover:opacity-90"
            aria-label={t("appName")}
          >
            <BerthWordmark size="md" label={t("appName")} />
          </Link>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              render={
                <a
                  href={GITHUB_REPO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              }
              aria-label={t("github")}
            >
              <GithubIcon />
              <span className="hidden sm:inline">{t("github")}</span>
            </Button>
            <Button variant="outline" size="sm" render={<Link href="/login" />}>
              {t("signIn")}
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-12">
        {children}
      </main>
    </div>
  );
}
