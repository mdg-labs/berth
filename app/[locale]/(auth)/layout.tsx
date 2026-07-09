// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { BerthWordmark } from "@/components/brand/berth-wordmark";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = await getTranslations("public");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12 text-foreground">
      <Link
        href="/"
        className="mb-8 transition-opacity hover:opacity-90"
        aria-label={t("appName")}
      >
        <BerthWordmark size="lg" label={t("appName")} />
      </Link>
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
